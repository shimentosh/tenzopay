import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  BlockchainNetwork,
  DepositSource,
  DepositStatus,
  NotificationType,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { LedgerService } from '../ledger/ledger.service';
import { FeesService } from '../ledger/fees.service';
import type { AppConfig } from '../config/configuration';
import {
  BLOCKCHAIN_PROVIDER,
  type BlockchainProvider,
  type TokenTransfer,
} from '../providers/blockchain-provider.interface';
import { MockBlockchainProvider } from '../providers/mock/mock-blockchain.provider';
import { DepositAddressService } from './deposit-address.service';
import { AppError, DepositModeError, NotFoundError } from '../common/errors';
import { parseAmount } from '@tenzopay/shared';

/**
 * Deposit detection, confirmation and crediting.
 *
 * The single most important property of this service: **a chain transfer is
 * credited exactly once**, no matter how many times it is observed.
 *
 * Two independent detection paths feed the same idempotent entry point:
 *   1. the Alchemy Address Activity webhook (fast), and
 *   2. the `getAssetTransfers` reconciliation sweep (a backstop for missed or
 *      failed webhook deliveries).
 *
 * Both call `recordTransfer()`, which is guarded by
 * `deposits UNIQUE(network, txHash, logIndex)`. Crediting is separately guarded
 * by `ledger_transactions UNIQUE(idempotencyKey)`. Two independent locks, so a
 * bug in one layer still cannot double-credit a user.
 */
@Injectable()
export class DepositsService {
  private readonly logger = new Logger(DepositsService.name);
  private readonly config: AppConfig;

  constructor(
    private readonly prisma: PrismaService,
    private readonly ledger: LedgerService,
    private readonly fees: FeesService,
    private readonly addresses: DepositAddressService,
    @Inject(BLOCKCHAIN_PROVIDER) private readonly chain: BlockchainProvider,
    configService: ConfigService<{ app: AppConfig }, true>,
  ) {
    this.config = configService.get('app', { infer: true });
  }

  // -------------------------------------------------------------- Ingest ----

  /**
   * Record an observed ERC-20 transfer.
   *
   * Idempotent. Returns the deposit id when the transfer belongs to a known
   * address, or null when it should be ignored (unknown address, wrong token,
   * below minimum).
   */
  async recordTransfer(
    transfer: TokenTransfer,
    source: DepositSource = DepositSource.ONCHAIN,
  ): Promise<string | null> {
    const toAddress = transfer.toAddress.toLowerCase();

    // Only credit transfers of the configured token. Anything else that lands
    // on the address is recorded for forensics but never credited.
    const expectedContract = this.config.deposits.usdtContract?.toLowerCase();
    if (expectedContract && transfer.contractAddress.toLowerCase() !== expectedContract) {
      this.logger.warn(
        `Ignoring transfer of unexpected token ${transfer.contractAddress} to ${toAddress}`,
      );
      await this.recordRawTransaction(transfer);
      return null;
    }

    const depositAddress = await this.prisma.depositAddress.findUnique({
      where: {
        network_address: { network: transfer.network as BlockchainNetwork, address: toAddress },
      },
      include: { wallet: { select: { userId: true } } },
    });

    if (!depositAddress) {
      this.logger.warn(`Transfer to unrecognised address ${toAddress} — ignoring`);
      await this.recordRawTransaction(transfer);
      return null;
    }

    await this.recordRawTransaction(transfer);

    if (transfer.amount < this.config.deposits.minAmount) {
      this.logger.warn(
        `Transfer ${transfer.txHash} below minimum (${transfer.amount}) — not credited`,
      );
      return null;
    }

    const userId = depositAddress.wallet.userId;

    try {
      const deposit = await this.prisma.deposit.create({
        data: {
          userId,
          addressId: depositAddress.id,
          network: transfer.network as BlockchainNetwork,
          amount: transfer.amount,
          currency: 'USDT',
          status: DepositStatus.DETECTED,
          source,
          txHash: transfer.txHash,
          logIndex: transfer.logIndex,
          fromAddress: transfer.fromAddress,
          toAddress,
          contractAddress: transfer.contractAddress,
          blockNumber: transfer.blockNumber,
          confirmations: 0,
          requiredConfirmations: this.config.deposits.confirmations,
          detectedAt: new Date(),
        },
      });

      await this.notify(userId, NotificationType.DEPOSIT_DETECTED, {
        title: 'Deposit detected',
        body: 'We spotted your USDT deposit and are waiting for network confirmations.',
        metadata: { depositId: deposit.id, txHash: transfer.txHash },
      });

      this.logger.log(
        `Deposit ${deposit.id} detected for user ${userId} (${transfer.amount} USDT)`,
      );

      // Confirmations may already be sufficient by the time we see it.
      await this.advanceConfirmations(deposit.id);
      return deposit.id;
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        // Already seen — this is the webhook and the sweep meeting each other.
        const existing = await this.prisma.deposit.findFirst({
          where: {
            network: transfer.network as BlockchainNetwork,
            txHash: transfer.txHash,
            logIndex: transfer.logIndex,
          },
          select: { id: true },
        });
        this.logger.debug(`Transfer ${transfer.txHash} already recorded — skipping`);
        if (existing) await this.advanceConfirmations(existing.id);
        return existing?.id ?? null;
      }
      throw err;
    }
  }

  private async recordRawTransaction(transfer: TokenTransfer): Promise<void> {
    await this.prisma.blockchainTransaction
      .create({
        data: {
          network: transfer.network as BlockchainNetwork,
          txHash: transfer.txHash,
          logIndex: transfer.logIndex,
          blockNumber: transfer.blockNumber,
          blockHash: transfer.blockHash ?? null,
          fromAddress: transfer.fromAddress.toLowerCase(),
          toAddress: transfer.toAddress.toLowerCase(),
          contractAddress: transfer.contractAddress.toLowerCase(),
          rawValue: transfer.rawValue,
          amount: transfer.amount,
          raw: (transfer.raw ?? {}) as Prisma.InputJsonValue,
        },
      })
      .catch((err) => {
        // Duplicate observation is expected and harmless.
        if (
          !(err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002')
        ) {
          throw err;
        }
      });
  }

  // ------------------------------------------------------- Confirmations ----

  /**
   * Advance a deposit's confirmation count and credit it once the required
   * depth is reached.
   *
   * Crediting happens exactly here and nowhere else.
   */
  async advanceConfirmations(depositId: string): Promise<void> {
    const deposit = await this.prisma.deposit.findUnique({ where: { id: depositId } });
    if (!deposit || !deposit.txHash) return;

    if (
      deposit.status === DepositStatus.CONFIRMED ||
      deposit.status === DepositStatus.FAILED ||
      deposit.status === DepositStatus.ORPHANED
    ) {
      return;
    }

    let confirmations: number | null;
    try {
      confirmations = await this.chain.getConfirmations(deposit.txHash);
    } catch (err) {
      this.logger.warn(`Could not read confirmations for ${deposit.txHash}; will retry`);
      return;
    }

    // The node no longer knows this transaction: it was re-orged out.
    if (confirmations === null) {
      const ageMs = Date.now() - deposit.createdAt.getTime();
      // Give it a grace period — propagation lag looks identical at first.
      if (ageMs > 10 * 60_000) {
        await this.prisma.deposit.update({
          where: { id: deposit.id },
          data: {
            status: DepositStatus.ORPHANED,
            failureReason: 'Transaction no longer present on chain (re-org)',
          },
        });
        this.logger.error(`Deposit ${deposit.id} orphaned — tx ${deposit.txHash} vanished`);
      }
      return;
    }

    const required = deposit.requiredConfirmations;

    if (confirmations < required) {
      await this.prisma.deposit.update({
        where: { id: deposit.id },
        data: { status: DepositStatus.CONFIRMING, confirmations },
      });
      return;
    }

    await this.credit(deposit.id, confirmations);
  }

  /**
   * Post the ledger credit and mark the deposit confirmed.
   *
   * Guarded three ways: a status re-check inside the transaction, the
   * `ledgerTransactionId` column, and the ledger's own idempotency key.
   */
  private async credit(depositId: string, confirmations: number): Promise<void> {
    const deposit = await this.prisma.deposit.findUnique({ where: { id: depositId } });
    if (!deposit) return;

    if (deposit.status === DepositStatus.CONFIRMED || deposit.ledgerTransactionId) {
      return; // already credited
    }

    /**
     * The fee comes out of the deposit, so the user is credited net and the
     * charge can never overdraw them. Rates are read here, at the moment of
     * crediting, and the resulting amount is persisted with the posting.
     */
    const feeAmount = await this.fees.depositFee(deposit.amount);

    const ledgerTransactionId = await this.ledger.creditDeposit({
      userId: deposit.userId,
      depositId: deposit.id,
      amount: deposit.amount,
      feeAmount,
      currency: deposit.currency,
      metadata: {
        txHash: deposit.txHash,
        network: deposit.network,
        source: deposit.source,
        feeAmount: feeAmount.toString(),
      },
    });

    await this.prisma.deposit.update({
      where: { id: deposit.id },
      data: {
        status: DepositStatus.CONFIRMED,
        confirmations,
        confirmedAt: new Date(),
        ledgerTransactionId,
      },
    });

    await this.notify(deposit.userId, NotificationType.DEPOSIT_CONFIRMED, {
      title: 'Deposit confirmed',
      body: 'Your USDT deposit has been credited to your balance.',
      metadata: { depositId: deposit.id, amount: deposit.amount.toString() },
    });

    this.logger.log(
      `Deposit ${deposit.id} CONFIRMED and credited (${deposit.amount} USDT, ` +
        `ledger tx ${ledgerTransactionId})`,
    );
  }

  /** Confirmation walker — run by the scheduled job. */
  async advanceAllPending(): Promise<{ checked: number; credited: number }> {
    const pending = await this.prisma.deposit.findMany({
      where: {
        status: { in: [DepositStatus.DETECTED, DepositStatus.CONFIRMING] },
      },
      select: { id: true },
      take: 200,
    });

    let credited = 0;
    for (const { id } of pending) {
      const before = await this.prisma.deposit.findUnique({
        where: { id },
        select: { status: true },
      });
      await this.advanceConfirmations(id);
      const after = await this.prisma.deposit.findUnique({
        where: { id },
        select: { status: true },
      });
      if (
        before?.status !== DepositStatus.CONFIRMED &&
        after?.status === DepositStatus.CONFIRMED
      ) {
        credited++;
      }
    }

    return { checked: pending.length, credited };
  }

  /**
   * Reconciliation sweep: re-read transfers straight from the chain for every
   * active address. This is what makes a dropped webhook a latency problem
   * rather than a lost deposit.
   */
  async reconcileAddress(addressId: string): Promise<{ found: number; recorded: number }> {
    const address = await this.prisma.depositAddress.findUnique({
      where: { id: addressId },
    });
    if (!address) throw new NotFoundError('Deposit address');

    const contract = this.config.deposits.usdtContract;
    if (!contract) {
      this.logger.warn('No USDT contract configured — skipping reconciliation');
      return { found: 0, recorded: 0 };
    }

    const page = await this.chain.getTokenTransfers({
      toAddress: address.address,
      contractAddress: contract,
      maxCount: 100,
    });

    let recorded = 0;
    for (const transfer of page.transfers) {
      const id = await this.recordTransfer(transfer);
      if (id) recorded++;
    }

    return { found: page.transfers.length, recorded };
  }

  // ---------------------------------------------------------------- Demo ----

  /**
   * Simulate an inbound deposit.
   *
   * Only reachable when DEPOSIT_MODE=demo. Configuration additionally forbids
   * demo mode when APP_ENV=production, so this cannot exist in a live
   * deployment — simulated funds must never be presented as real.
   */
  async simulateDeposit(userId: string, amountInput: string) {
    if (this.config.deposits.mode !== 'demo') {
      throw new DepositModeError(
        'Simulated deposits are only available in demo mode.',
      );
    }

    const amount = parseAmount(amountInput, 'USDT');
    if (amount <= 0n) {
      throw new AppError('INVALID_AMOUNT', 'Enter an amount greater than zero.', 400);
    }
    if (amount < this.config.deposits.minAmount) {
      throw new AppError(
        'BELOW_MINIMUM',
        'That amount is below the minimum deposit.',
        400,
      );
    }

    const address = await this.addresses.getOrCreate(userId);

    if (!(this.chain instanceof MockBlockchainProvider)) {
      throw new DepositModeError(
        'Simulated deposits require the mock blockchain provider.',
      );
    }

    const transfer = await this.chain.simulateTransfer({
      toAddress: address.address,
      amount,
      contractAddress: this.config.deposits.usdtContract || '0xdemo',
    });

    const depositId = await this.recordTransfer(transfer, DepositSource.DEMO);
    this.logger.warn(`DEMO deposit simulated for user ${userId}: ${amount} USDT`);

    return { depositId, txHash: transfer.txHash, amount: amount.toString() };
  }

  // -------------------------------------------------------------- Queries ----

  async listForUser(userId: string, limit = 25, cursor?: string) {
    const deposits = await this.prisma.deposit.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      include: { address: { select: { isDemo: true } } },
    });

    const hasMore = deposits.length > limit;
    const page = hasMore ? deposits.slice(0, limit) : deposits;

    return {
      data: page.map((d) => ({
        id: d.id,
        amount: d.amount.toString(),
        currency: d.currency,
        status: d.status,
        network: d.network,
        txHash: d.txHash,
        confirmations: d.confirmations,
        requiredConfirmations: d.requiredConfirmations,
        isDemo: d.source === DepositSource.DEMO || (d.address?.isDemo ?? false),
        createdAt: d.createdAt.toISOString(),
        confirmedAt: d.confirmedAt?.toISOString() ?? null,
      })),
      nextCursor: hasMore ? page[page.length - 1].id : null,
      hasMore,
    };
  }

  private async notify(
    userId: string,
    type: NotificationType,
    params: { title: string; body: string; metadata?: Prisma.InputJsonValue },
  ): Promise<void> {
    await this.prisma.notification
      .create({
        data: {
          userId,
          type,
          title: params.title,
          body: params.body,
          metadata: params.metadata,
        },
      })
      .catch(() => undefined); // never let a notification failure break money flow
  }
}
