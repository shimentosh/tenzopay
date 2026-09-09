import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { ConfigService } from '@nestjs/config';
import { DepositStatus, WebhookProvider, WebhookStatus } from '@prisma/client';
import { PrismaService } from '../src/prisma/prisma.service';
import { LedgerService } from '../src/ledger/ledger.service';
import { FeesService } from '../src/ledger/fees.service';
import { SettingsService } from '../src/settings/settings.service';
import { DepositsService } from '../src/deposits/deposits.service';
import { DepositAddressService } from '../src/deposits/deposit-address.service';
import { MockBlockchainProvider } from '../src/providers/mock/mock-blockchain.provider';
import { buildConfig } from '../src/config/configuration';
import type { TokenTransfer } from '../src/providers/blockchain-provider.interface';
import { sha256Hex } from '../src/common/crypto.util';

/**
 * Deposit pipeline tests.
 *
 * The property under test is the one that matters most in any crypto-funded
 * product: **a chain transfer is credited exactly once**, no matter how many
 * times it is observed, in what order, or by which detection path.
 */
describe('deposit pipeline', () => {
  let prisma: PrismaService;
  let ledger: LedgerService;
  let deposits: DepositsService;
  let chain: MockBlockchainProvider;
  let userId: string;
  let address: string;

  const config = buildConfig({
    ...process.env,
    DEPOSIT_MODE: 'demo',
    DEPOSIT_NETWORK: 'ETHEREUM_SEPOLIA',
    DEPOSIT_CONFIRMATIONS: '12',
    CARD_PROVIDER: 'mock',
    BLOCKCHAIN_PROVIDER: 'mock',
  } as NodeJS.ProcessEnv);

  const configService = {
    get: () => config,
  } as unknown as ConfigService<{ app: ReturnType<typeof buildConfig> }, true>;

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
    ledger = new LedgerService(prisma);
    // Fees read their rates from settings; with none stored, every rate is the
    // registry default of zero, so these tests still assert gross crediting.
    const settings = new SettingsService(prisma, configService);
    const fees = new FeesService(settings);
    chain = new MockBlockchainProvider(configService);
    const addresses = new DepositAddressService(prisma, chain, configService);
    deposits = new DepositsService(prisma, ledger, fees, addresses, chain, configService);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await prisma.blockchainTransaction.deleteMany();
    await prisma.deposit.deleteMany();
    await prisma.depositAddress.deleteMany();
    await prisma.ledgerEntry.deleteMany();
    await prisma.ledgerTransaction.deleteMany();
    await prisma.ledgerAccount.deleteMany();
    await prisma.notification.deleteMany();
    await prisma.wallet.deleteMany();
    await prisma.user.deleteMany();

    const user = await prisma.user.create({
      data: {
        email: `dep-${Date.now()}@test.dev`,
        passwordHash: 'x',
        wallet: { create: {} },
      },
      select: { id: true, wallet: { select: { id: true } } },
    });
    userId = user.id;
    await ledger.ensureUserAccounts(userId);

    address = '0x1111111111111111111111111111111111111111';
    await prisma.depositAddress.create({
      data: {
        walletId: user.wallet!.id,
        network: 'ETHEREUM_SEPOLIA',
        address,
        derivationIndex: 0,
        isDemo: true,
      },
    });
  });

  function transfer(overrides: Partial<TokenTransfer> = {}): TokenTransfer {
    return {
      network: 'ETHEREUM_SEPOLIA',
      txHash: '0xaaaa000000000000000000000000000000000000000000000000000000000001',
      logIndex: 0,
      blockNumber: 6_000_000n,
      fromAddress: '0x2222222222222222222222222222222222222222',
      toAddress: address,
      contractAddress: '0xdac17f958d2ee523a2206206994597c13d831ec7',
      rawValue: '5000000000',
      amount: 5_000_000_000n, // 5,000 USDT
      ...overrides,
    };
  }

  describe('detection', () => {
    it('records a transfer to a known address', async () => {
      const id = await deposits.recordTransfer(transfer());
      expect(id).toBeTruthy();

      const deposit = await prisma.deposit.findUniqueOrThrow({ where: { id: id! } });
      expect(deposit.amount).toBe(5_000_000_000n);
      expect(deposit.userId).toBe(userId);
      // Not yet credited: confirmations have not been reached.
      expect(deposit.ledgerTransactionId).toBeNull();
    });

    it('ignores a transfer to an address we do not own', async () => {
      const id = await deposits.recordTransfer(
        transfer({ toAddress: '0x9999999999999999999999999999999999999999' }),
      );

      expect(id).toBeNull();
      expect(await prisma.deposit.count()).toBe(0);
      // Still recorded for forensics, just never credited.
      expect(await prisma.blockchainTransaction.count()).toBe(1);
    });

    it('ignores a transfer below the minimum', async () => {
      const id = await deposits.recordTransfer(transfer({ amount: 1n, rawValue: '1' }));
      expect(id).toBeNull();
      expect(await prisma.deposit.count()).toBe(0);
    });
  });

  describe('duplicate prevention', () => {
    it('records the same transfer only once', async () => {
      const first = await deposits.recordTransfer(transfer());
      const second = await deposits.recordTransfer(transfer());

      expect(second).toBe(first);
      expect(await prisma.deposit.count()).toBe(1);
    });

    it('deduplicates when the webhook and the sweep arrive together', async () => {
      const results = await Promise.all(
        Array.from({ length: 6 }, () => deposits.recordTransfer(transfer())),
      );

      expect(new Set(results.filter(Boolean)).size).toBe(1);
      expect(await prisma.deposit.count()).toBe(1);
    });

    it('treats two transfers in one transaction as distinct deposits', async () => {
      // One transaction can carry several ERC-20 Transfer logs, which is why
      // the natural key includes logIndex rather than just the hash.
      await deposits.recordTransfer(transfer({ logIndex: 0 }));
      await deposits.recordTransfer(transfer({ logIndex: 1 }));

      expect(await prisma.deposit.count()).toBe(2);
    });
  });

  describe('confirmation and crediting', () => {
    it('does not credit before the required confirmations', async () => {
      const simulated = await chain.simulateTransfer({
        toAddress: address,
        amount: 5_000_000_000n,
        contractAddress: '0xdac17f958d2ee523a2206206994597c13d831ec7',
      });

      const id = await deposits.recordTransfer(simulated);
      await deposits.advanceConfirmations(id!);

      const deposit = await prisma.deposit.findUniqueOrThrow({ where: { id: id! } });
      expect(deposit.status).toBe(DepositStatus.CONFIRMING);
      expect(deposit.ledgerTransactionId).toBeNull();
      expect((await ledger.getBalance(userId)).available).toBe(0n);
    });

    it('credits exactly once when confirmations are reached', async () => {
      const simulated = await chain.simulateTransfer({
        toAddress: address,
        amount: 5_000_000_000n,
        contractAddress: '0xdac17f958d2ee523a2206206994597c13d831ec7',
      });
      const id = await deposits.recordTransfer(simulated);

      // Force the deposit past its confirmation threshold.
      await prisma.deposit.update({
        where: { id: id! },
        data: { requiredConfirmations: 1 },
      });

      await deposits.advanceConfirmations(id!);
      await deposits.advanceConfirmations(id!); // re-run must be a no-op
      await deposits.advanceConfirmations(id!);

      const deposit = await prisma.deposit.findUniqueOrThrow({ where: { id: id! } });
      expect(deposit.status).toBe(DepositStatus.CONFIRMED);
      expect(deposit.ledgerTransactionId).toBeTruthy();

      expect((await ledger.getBalance(userId)).available).toBe(5_000_000_000n);
      expect(
        await prisma.ledgerTransaction.count({ where: { type: 'DEPOSIT_CONFIRMED' } }),
      ).toBe(1);
    });

    it('keeps the ledger balanced through the whole lifecycle', async () => {
      const simulated = await chain.simulateTransfer({
        toAddress: address,
        amount: 2_500_000_000n,
        contractAddress: '0xdac17f958d2ee523a2206206994597c13d831ec7',
      });
      const id = await deposits.recordTransfer(simulated);
      await prisma.deposit.update({ where: { id: id! }, data: { requiredConfirmations: 1 } });
      await deposits.advanceConfirmations(id!);

      const integrity = await ledger.verifyIntegrity();
      expect(integrity.ok).toBe(true);
    });
  });
});

/**
 * Webhook intake is idempotent at the database level: the unique constraint on
 * (provider, eventId) is the lock, so a redelivery cannot be processed twice
 * even across a restart or a second instance.
 */
describe('webhook idempotency', () => {
  let prisma: PrismaService;

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await prisma.webhookEvent.deleteMany();
  });

  it('accepts an event once and rejects the redelivery', async () => {
    const payload = { token: 'txn_1', amount: 100 };
    const body = Buffer.from(JSON.stringify(payload));

    const create = () =>
      prisma.webhookEvent.create({
        data: {
          provider: WebhookProvider.LITHIC,
          eventId: 'evt_duplicate',
          eventType: 'card_transaction.updated',
          payloadHash: sha256Hex(body),
          payload,
          status: WebhookStatus.RECEIVED,
        },
      });

    await create();
    await expect(create()).rejects.toMatchObject({ code: 'P2002' });

    expect(await prisma.webhookEvent.count()).toBe(1);
  });

  it('allows the same event id from different providers', async () => {
    for (const provider of [WebhookProvider.LITHIC, WebhookProvider.ALCHEMY]) {
      await prisma.webhookEvent.create({
        data: {
          provider,
          eventId: 'shared_id',
          eventType: 'test',
          payloadHash: 'hash',
          payload: {},
          status: WebhookStatus.RECEIVED,
        },
      });
    }

    expect(await prisma.webhookEvent.count()).toBe(2);
  });

  it('survives concurrent deliveries of the same event', async () => {
    const attempts = await Promise.allSettled(
      Array.from({ length: 5 }, () =>
        prisma.webhookEvent.create({
          data: {
            provider: WebhookProvider.LITHIC,
            eventId: 'evt_race',
            eventType: 'test',
            payloadHash: 'hash',
            payload: {},
            status: WebhookStatus.RECEIVED,
          },
        }),
      ),
    );

    expect(attempts.filter((a) => a.status === 'fulfilled')).toHaveLength(1);
    expect(await prisma.webhookEvent.count()).toBe(1);
  });
});
