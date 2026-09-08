import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  CardStatus,
  CardTransactionStatus,
  Prisma,
  WebhookProvider,
  WebhookStatus,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { LedgerService } from '../ledger/ledger.service';
import { KycService } from '../kyc/kyc.service';
import { DepositsService } from '../deposits/deposits.service';
import type { AppConfig } from '../config/configuration';
import { sha256Hex } from '../common/crypto.util';
import { redact } from '../common/redact';
import { fromTokenRawValue } from '@tenzopay/shared';
import type { TokenTransfer, SupportedNetwork } from '../providers/blockchain-provider.interface';

/**
 * Webhook intake and processing.
 *
 * Idempotency model: `webhook_events UNIQUE(provider, eventId)`. The insert
 * either succeeds (first delivery, we process) or raises P2002 (redelivery, we
 * skip). The database is the lock — no in-memory dedupe, which would not
 * survive a restart or a second instance.
 *
 * Processing is best-effort and retryable: failures are recorded with the
 * error and retry count, and the admin console can replay them.
 */
@Injectable()
export class WebhooksService {
  private readonly logger = new Logger(WebhooksService.name);
  private readonly config: AppConfig;

  constructor(
    private readonly prisma: PrismaService,
    private readonly ledger: LedgerService,
    private readonly kyc: KycService,
    private readonly deposits: DepositsService,
    configService: ConfigService<{ app: AppConfig }, true>,
  ) {
    this.config = configService.get('app', { infer: true });
  }

  /** Persist a delivery, then process it out of band. */
  async receive(params: {
    provider: WebhookProvider;
    eventId: string;
    eventType: string;
    payload: Record<string, unknown>;
    rawBody: Buffer;
  }): Promise<{ accepted: boolean; eventId: string }> {
    const eventId = params.eventId || sha256Hex(params.rawBody);

    try {
      const event = await this.prisma.webhookEvent.create({
        data: {
          provider: params.provider,
          eventId,
          eventType: params.eventType,
          payloadHash: sha256Hex(params.rawBody),
          // Redact before persisting: raw provider payloads can carry PAN
          // fragments and other sensitive fields.
          payload: redact(params.payload) as Prisma.InputJsonValue,
          status: WebhookStatus.RECEIVED,
        },
      });

      // Deliberately not awaited: the provider gets its 200 immediately.
      void this.process(event.id).catch((err) => {
        this.logger.error(
          `Unhandled error processing webhook ${event.id}: ` +
            `${err instanceof Error ? err.message : 'unknown'}`,
        );
      });

      return { accepted: true, eventId };
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        this.logger.debug(
          `Duplicate webhook ${params.provider}/${eventId} — already handled`,
        );
        return { accepted: false, eventId };
      }
      throw err;
    }
  }

  /** Process one stored event. Safe to call again after a failure. */
  async process(webhookEventId: string): Promise<void> {
    const event = await this.prisma.webhookEvent.findUnique({
      where: { id: webhookEventId },
    });
    if (!event) return;

    if (event.status === WebhookStatus.PROCESSED) return;

    await this.prisma.webhookEvent.update({
      where: { id: event.id },
      data: { status: WebhookStatus.PROCESSING },
    });

    try {
      const payload = event.payload as Record<string, unknown>;

      if (event.provider === WebhookProvider.LITHIC) {
        await this.processLithic(event.eventType, payload);
      } else {
        await this.processAlchemy(payload);
      }

      await this.prisma.webhookEvent.update({
        where: { id: event.id },
        data: { status: WebhookStatus.PROCESSED, processedAt: new Date(), error: null },
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'unknown error';
      const retryCount = event.retryCount + 1;

      // After five attempts stop retrying automatically and surface it to an
      // operator rather than looping forever.
      const status =
        retryCount >= 5 ? WebhookStatus.DEAD_LETTER : WebhookStatus.FAILED;

      await this.prisma.webhookEvent.update({
        where: { id: event.id },
        data: { status, retryCount, error: message.slice(0, 500) },
      });

      this.logger.error(
        `Webhook ${event.id} (${event.eventType}) failed [${retryCount}/5]: ${message}`,
      );
    }
  }

  // -------------------------------------------------------------- Lithic ----

  private async processLithic(
    eventType: string,
    payload: Record<string, unknown>,
  ): Promise<void> {
    switch (eventType) {
      case 'account_holder.verification':
      case 'account_holder.updated':
        await this.kyc.applyProviderUpdate({
          accountHolderToken: String(
            payload.account_holder_token ?? payload.token ?? '',
          ),
          status: String(payload.status ?? ''),
          statusReasons: (payload.status_reasons as string[]) ?? [],
        });
        break;

      case 'card_transaction.updated':
        await this.syncCardTransaction(payload);
        break;

      case 'card.updated':
        await this.syncCardState(payload);
        break;

      default:
        this.logger.debug(`Unhandled Lithic event type: ${eventType}`);
    }
  }

  /**
   * Reconcile a card transaction and settle or release the matching hold.
   *
   * The hold was placed by ASA keyed on the authorization event token. Here we
   * either convert it into a settlement or return it to available.
   */
  private async syncCardTransaction(payload: Record<string, unknown>): Promise<void> {
    const transaction = (payload.transaction ?? payload) as Record<string, unknown>;

    const token = String(transaction.token ?? '');
    const cardToken = String(transaction.card_token ?? '');
    if (!token || !cardToken) return;

    const card = await this.prisma.card.findUnique({
      where: { providerCardToken: cardToken },
      select: { id: true, userId: true, name: true },
    });
    if (!card) {
      this.logger.warn(`Transaction webhook for unknown card ${cardToken}`);
      return;
    }

    const amounts = transaction.amounts as
      | Record<string, { amount?: number; currency?: string }>
      | undefined;

    const status = String(transaction.status ?? '').toUpperCase();
    const holdCents = BigInt(Math.abs(amounts?.hold?.amount ?? amounts?.cardholder?.amount ?? 0));
    const settlementCents = BigInt(Math.abs(amounts?.settlement?.amount ?? 0));

    const mapped = this.mapTransactionStatus(status);

    const existing = await this.prisma.cardTransaction.findUnique({
      where: { providerTransactionToken: token },
      select: { id: true, status: true, amount: true },
    });

    const record = await this.prisma.cardTransaction.upsert({
      where: { providerTransactionToken: token },
      create: {
        cardId: card.id,
        userId: card.userId,
        providerTransactionToken: token,
        status: mapped,
        amount: holdCents,
        settledAmount: settlementCents > 0n ? settlementCents : null,
        currency: amounts?.cardholder?.currency ?? 'USD',
        merchantName: this.merchantField(transaction, 'descriptor'),
        mcc: this.merchantField(transaction, 'mcc'),
        merchantCountry: this.merchantField(transaction, 'country'),
        networkResult: String(transaction.result ?? ''),
        authorizedAt: new Date(),
        raw: redact(transaction) as Prisma.InputJsonValue,
      },
      update: {
        status: mapped,
        settledAmount: settlementCents > 0n ? settlementCents : undefined,
        networkResult: String(transaction.result ?? ''),
        raw: redact(transaction) as Prisma.InputJsonValue,
      },
    });

    // Only act on the ledger when the state actually changes.
    if (existing?.status === mapped) return;

    const heldUsdt = (existing?.amount ?? holdCents) * 10_000n;

    if (mapped === CardTransactionStatus.SETTLED) {
      const settledUsdt = (settlementCents > 0n ? settlementCents : holdCents) * 10_000n;

      const ledgerTxId = await this.ledger.settleAuthorization({
        userId: card.userId,
        idempotencyKey: `settle:${token}`,
        heldAmount: heldUsdt,
        settledAmount: settledUsdt,
        description: `Card settlement — ${card.name}`,
        metadata: { cardId: card.id, transactionToken: token },
      });

      await this.prisma.cardTransaction.update({
        where: { id: record.id },
        data: { settleLedgerTransactionId: ledgerTxId, settledAt: new Date() },
      });

      this.logger.log(`Transaction ${token} settled for user ${card.userId}`);
      return;
    }

    if (
      mapped === CardTransactionStatus.REVERSED ||
      mapped === CardTransactionStatus.EXPIRED ||
      mapped === CardTransactionStatus.DECLINED
    ) {
      // Only release if a hold was actually placed by ASA.
      const hadHold = await this.prisma.ledgerTransaction.findUnique({
        where: { idempotencyKey: `auth:${token}` },
        select: { id: true },
      });

      if (hadHold && heldUsdt > 0n) {
        await this.ledger.releaseHold({
          userId: card.userId,
          idempotencyKey: `release:${token}`,
          amount: heldUsdt,
          description: `Authorization released — ${card.name}`,
        });
        this.logger.log(`Hold released for transaction ${token}`);
      }
    }
  }

  private merchantField(
    transaction: Record<string, unknown>,
    field: string,
  ): string | null {
    const merchant = transaction.merchant as Record<string, unknown> | undefined;
    const value = merchant?.[field];
    return value === undefined || value === null ? null : String(value);
  }

  private mapTransactionStatus(status: string): CardTransactionStatus {
    switch (status) {
      case 'SETTLED':
        return CardTransactionStatus.SETTLED;
      case 'DECLINED':
        return CardTransactionStatus.DECLINED;
      case 'VOIDED':
      case 'REVERSED':
        return CardTransactionStatus.REVERSED;
      case 'EXPIRED':
        return CardTransactionStatus.EXPIRED;
      default:
        return CardTransactionStatus.PENDING;
    }
  }

  private async syncCardState(payload: Record<string, unknown>): Promise<void> {
    const cardToken = String(payload.card_token ?? payload.token ?? '');
    const state = String(payload.state ?? '').toUpperCase();
    if (!cardToken || !state) return;

    const status =
      state === 'OPEN'
        ? CardStatus.ACTIVE
        : state === 'PAUSED'
          ? CardStatus.FROZEN
          : state === 'CLOSED'
            ? CardStatus.CLOSED
            : null;

    if (!status) return;

    await this.prisma.card
      .update({
        where: { providerCardToken: cardToken },
        data: { status, lastSyncedAt: new Date() },
      })
      .catch(() => undefined);
  }

  // ------------------------------------------------------------- Alchemy ----

  /**
   * Address Activity payload -> deposit pipeline.
   *
   * Uses `rawContract.rawValue` (hex) rather than the float `value` field: the
   * latter loses precision above 2^53 and would mis-credit a large deposit.
   */
  private async processAlchemy(payload: Record<string, unknown>): Promise<void> {
    const event = payload.event as Record<string, unknown> | undefined;
    const activity = (event?.activity ?? []) as Record<string, unknown>[];

    if (!Array.isArray(activity) || activity.length === 0) {
      this.logger.debug('Alchemy webhook contained no activity');
      return;
    }

    const network = this.config.deposits.network as SupportedNetwork;

    for (const item of activity) {
      if (String(item.category ?? '').toLowerCase() !== 'token') continue;

      const rawContract = item.rawContract as
        | { rawValue?: string; address?: string; decimals?: number }
        | undefined;

      if (!rawContract?.rawValue || !rawContract.address) continue;

      const decimals = rawContract.decimals ?? this.config.deposits.usdtDecimals;
      const rawValue = BigInt(rawContract.rawValue);

      const transfer: TokenTransfer = {
        network,
        txHash: String(item.hash ?? ''),
        logIndex: Number((item.log as { logIndex?: string })?.logIndex ?? 0),
        blockNumber: BigInt(String(item.blockNum ?? '0x0')),
        fromAddress: String(item.fromAddress ?? '').toLowerCase(),
        toAddress: String(item.toAddress ?? '').toLowerCase(),
        contractAddress: rawContract.address.toLowerCase(),
        rawValue: rawValue.toString(),
        amount: fromTokenRawValue(rawValue, decimals, 'USDT'),
        raw: item,
      };

      if (!transfer.txHash) continue;

      await this.deposits.recordTransfer(transfer);
    }
  }

  // ---------------------------------------------------------------- Admin ----

  /** Re-run a failed or dead-lettered event. */
  async replay(webhookEventId: string): Promise<void> {
    await this.prisma.webhookEvent.update({
      where: { id: webhookEventId },
      data: { status: WebhookStatus.RECEIVED, error: null },
    });
    await this.process(webhookEventId);
  }

  /** Scheduled retry of transient failures. */
  async retryFailed(limit = 20): Promise<{ retried: number }> {
    const failed = await this.prisma.webhookEvent.findMany({
      where: { status: WebhookStatus.FAILED, retryCount: { lt: 5 } },
      orderBy: { receivedAt: 'asc' },
      take: limit,
      select: { id: true },
    });

    for (const event of failed) {
      await this.process(event.id);
    }

    return { retried: failed.length };
  }
}
