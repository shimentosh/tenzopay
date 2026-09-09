import { beforeAll, afterAll, beforeEach, describe, expect, it } from 'vitest';
import { ConfigService } from '@nestjs/config';
import { LedgerAccountKind } from '@prisma/client';
import { PrismaService } from '../src/prisma/prisma.service';
import { LedgerService } from '../src/ledger/ledger.service';
import { FeesService } from '../src/ledger/fees.service';
import { SettingsService } from '../src/settings/settings.service';
import { buildConfig } from '../src/config/configuration';

/**
 * Fees.
 *
 * The invariant under test throughout: a fee is only ever taken from money
 * that has already been reserved for it. A deposit fee comes out of the
 * deposit; a transaction fee comes out of the authorization hold. Neither may
 * leave a balance negative, and every posting must still net to zero.
 */
describe('fees', () => {
  let prisma: PrismaService;
  let ledger: LedgerService;
  let fees: FeesService;

  const config = buildConfig({
    DATABASE_URL: process.env.DATABASE_URL,
    JWT_ACCESS_SECRET: 'a'.repeat(40),
    JWT_REFRESH_SECRET: 'b'.repeat(40),
    ENCRYPTION_KEY: '0'.repeat(64),
    APP_ENV: 'development',
  } as NodeJS.ProcessEnv);

  const configService = {
    get: () => config,
  } as unknown as ConfigService<{ app: ReturnType<typeof buildConfig> }, true>;

  const userId = '00000000-0000-4000-8000-0000000000fe';

  /**
   * Rates are held in memory rather than in the settings table.
   *
   * A rate is global and the database is shared across suites. Written here,
   * `fee.deposit.bps` outlived this file and the deposit suite that runs after
   * it credited 2.5% less than it expected. Stubbing the lookup keeps the
   * arithmetic under test without touching state anything else can see.
   */
  const rates = new Map<string, bigint>();
  function setRate(key: string, value: string) {
    rates.set(key, BigInt(value));
  }

  const settingsStub = {
    get: async (key: string) => rates.get(key) ?? 0n,
    getMany: async (keys: string[]) =>
      Object.fromEntries(keys.map((key) => [key, rates.get(key) ?? 0n])),
  } as unknown as SettingsService;

  async function balance(kind: LedgerAccountKind, owner: string | null) {
    const accountId = await ledger.ensureAccount(kind, owner);
    return ledger.getAccountBalance(accountId);
  }

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
    ledger = new LedgerService(prisma);
    fees = new FeesService(settingsStub);

    await prisma.user.upsert({
      where: { id: userId },
      create: { id: userId, email: 'fees@tenzopay.test', passwordHash: 'x' },
      update: {},
    });
  });

  afterAll(async () => {
    await prisma.fee.deleteMany({ where: { userId } });
    await prisma.user.delete({ where: { id: userId } }).catch(() => undefined);
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    rates.clear();
    await prisma.fee.deleteMany({ where: { userId } });
    await prisma.ledgerEntry.deleteMany();
    await prisma.ledgerTransaction.deleteMany();
    await prisma.ledgerAccount.deleteMany();
  });

  // ------------------------------------------------------------ Arithmetic --

  it('charges nothing while every rate is still zero', async () => {
    expect(await fees.depositFee(1_000_000n)).toBe(0n);
    expect(await fees.transactionFee(1_000_000n, false)).toBe(0n);
  });

  it('takes basis points of the amount', async () => {
    setRate('fee.deposit.bps', '150'); // 1.5%
    expect(await fees.depositFee(1_000_000n)).toBe(15_000n);
  });

  it('truncates rather than rounding up, so the customer keeps the remainder', async () => {
    setRate('fee.deposit.bps', '1'); // 0.01%
    // 999 * 1 / 10000 = 0.0999 -> 0
    expect(await fees.depositFee(999n)).toBe(0n);
    // 19999 * 1 / 10000 = 1.9999 -> 1, not 2
    expect(await fees.depositFee(19_999n)).toBe(1n);
  });

  it('adds the flat part on top of the percentage', async () => {
    setRate('fee.deposit.bps', '100');
    setRate('fee.deposit.flat', '5_000'.replace('_', ''));
    expect(await fees.depositFee(1_000_000n)).toBe(15_000n);
  });

  it('applies the floor and the cap', async () => {
    setRate('fee.deposit.bps', '100');
    setRate('fee.deposit.min', '50000');
    expect(await fees.depositFee(1_000_000n)).toBe(50_000n);

    setRate('fee.deposit.min', '0');
    setRate('fee.deposit.max', '5000');
    expect(await fees.depositFee(1_000_000n)).toBe(5_000n);
  });

  it('never charges more than the deposit itself', async () => {
    setRate('fee.deposit.min', '900000');
    expect(await fees.depositFee(1_000n)).toBe(1_000n);
  });

  it('adds the FX margin only on a foreign-currency transaction', async () => {
    setRate('fee.transaction.bps', '50');
    setRate('fee.fx.bps', '150');

    expect(await fees.transactionFee(1_000_000n, false)).toBe(5_000n);
    expect(await fees.transactionFee(1_000_000n, true)).toBe(20_000n);
  });

  // --------------------------------------------------------------- Postings --

  it('credits a deposit net of the fee and books the fee as revenue', async () => {
    setRate('fee.deposit.bps', '200'); // 2%
    const gross = 1_000_000n;
    const fee = await fees.depositFee(gross);
    expect(fee).toBe(20_000n);

    const txId = await ledger.creditDeposit({
      userId,
      depositId: '00000000-0000-4000-8000-0000000000d1',
      amount: gross,
      feeAmount: fee,
    });

    expect(await balance(LedgerAccountKind.USER_AVAILABLE, userId)).toBe(gross - fee);
    expect(await balance(LedgerAccountKind.SYSTEM_FEE_REVENUE, null)).toBe(fee);

    // The posting nets to zero, which is the invariant the whole ledger rests on.
    const entries = await prisma.ledgerEntry.findMany({ where: { transactionId: txId } });
    const net = entries.reduce(
      (total, entry) => total + (entry.direction === 'CREDIT' ? entry.amount : -entry.amount),
      0n,
    );
    expect(net).toBe(0n);

    const feeRow = await prisma.fee.findFirst({ where: { userId } });
    expect(feeRow?.amount).toBe(fee);
    expect(feeRow?.ledgerTransactionId).toBe(txId);
  });

  it('collects the transaction fee out of the hold, not the remaining balance', async () => {
    // Fund the account, then hold exactly the spend plus its fee.
    await ledger.creditDeposit({
      userId,
      depositId: '00000000-0000-4000-8000-0000000000d2',
      amount: 100_000n,
    });

    const spend = 90_000n;
    const fee = 10_000n;
    await ledger.placeHold({
      userId,
      idempotencyKey: 'auth:test-fee',
      amount: spend + fee,
      description: 'test authorization',
    });

    // Everything is now held; available is empty. A fee charged from available
    // at this point would have to overdraw — it must come from the hold.
    expect(await balance(LedgerAccountKind.USER_AVAILABLE, userId)).toBe(0n);

    await ledger.settleAuthorization({
      userId,
      idempotencyKey: 'settle:test-fee',
      heldAmount: spend + fee,
      settledAmount: spend,
      feeAmount: fee,
    });

    expect(await balance(LedgerAccountKind.USER_HELD, userId)).toBe(0n);
    expect(await balance(LedgerAccountKind.USER_AVAILABLE, userId)).toBe(0n);
    expect(await balance(LedgerAccountKind.SYSTEM_FEE_REVENUE, null)).toBe(fee);
  });

  it('returns the unused hold when the merchant captures less', async () => {
    await ledger.creditDeposit({
      userId,
      depositId: '00000000-0000-4000-8000-0000000000d3',
      amount: 100_000n,
    });

    const fee = 2_000n;
    await ledger.placeHold({
      userId,
      idempotencyKey: 'auth:test-under',
      amount: 50_000n + fee,
      description: 'test authorization',
    });

    await ledger.settleAuthorization({
      userId,
      idempotencyKey: 'settle:test-under',
      heldAmount: 50_000n + fee,
      settledAmount: 30_000n,
      feeAmount: fee,
    });

    // 100,000 funded - 30,000 captured - 2,000 fee = 68,000 back to available.
    expect(await balance(LedgerAccountKind.USER_AVAILABLE, userId)).toBe(68_000n);
    expect(await balance(LedgerAccountKind.SYSTEM_FEE_REVENUE, null)).toBe(fee);
    expect(await balance(LedgerAccountKind.USER_HELD, userId)).toBe(0n);
  });

  it('reverses a re-orged deposit, taking the fee back out of revenue too', async () => {
    setRate('fee.deposit.bps', '200');
    const gross = 1_000_000n;
    const fee = await fees.depositFee(gross);

    await ledger.creditDeposit({
      userId,
      depositId: '00000000-0000-4000-8000-0000000000d5',
      amount: gross,
      feeAmount: fee,
    });

    await ledger.reverseDeposit({
      userId,
      depositId: '00000000-0000-4000-8000-0000000000d5',
      amount: gross,
      feeAmount: fee,
      reason: 'test re-org',
    });

    // Everything returns to where it started: the user keeps nothing, and the
    // fee does not stay booked as revenue on money that never really arrived.
    expect(await balance(LedgerAccountKind.USER_AVAILABLE, userId)).toBe(0n);
    expect(await balance(LedgerAccountKind.SYSTEM_FEE_REVENUE, null)).toBe(0n);
    expect(await balance(LedgerAccountKind.SYSTEM_DEPOSIT_CLEARING, null)).toBe(0n);
  });

  it('reverses even when the money has already been spent, and says so', async () => {
    const gross = 100_000n;
    await ledger.creditDeposit({
      userId,
      depositId: '00000000-0000-4000-8000-0000000000d6',
      amount: gross,
    });

    // Spend it all, so the reversal has nothing to claw back from.
    await ledger.placeHold({
      userId,
      idempotencyKey: 'auth:spent',
      amount: gross,
      description: 'spent it',
    });
    await ledger.settleAuthorization({
      userId,
      idempotencyKey: 'settle:spent',
      heldAmount: gross,
      settledAmount: gross,
    });

    await ledger.reverseDeposit({
      userId,
      depositId: '00000000-0000-4000-8000-0000000000d6',
      amount: gross,
      reason: 'test re-org after spending',
    });

    // The balance goes negative on purpose. A ledger that quietly disagreed
    // with the chain would be worse, and the integrity job raises it for a
    // human — this is effectively a chargeback against us.
    expect(await balance(LedgerAccountKind.USER_AVAILABLE, userId)).toBe(-gross);

    const integrity = await ledger.verifyIntegrity();
    expect(integrity.unbalanced).toHaveLength(0);
    expect(integrity.negativeBalances.length).toBeGreaterThan(0);
  });

  it('leaves the ledger balanced and no balance negative', async () => {
    setRate('fee.deposit.bps', '250');
    await ledger.creditDeposit({
      userId,
      depositId: '00000000-0000-4000-8000-0000000000d4',
      amount: 500_000n,
      feeAmount: await fees.depositFee(500_000n),
    });

    const integrity = await ledger.verifyIntegrity();
    expect(integrity.unbalanced).toHaveLength(0);
    expect(integrity.negativeBalances).toHaveLength(0);
  });
});
