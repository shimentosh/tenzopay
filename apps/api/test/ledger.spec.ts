import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { LedgerAccountKind, LedgerDirection, LedgerTransactionType, PrismaClient } from '@prisma/client';
import { LedgerService } from '../src/ledger/ledger.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { InsufficientBalanceError, LedgerImbalanceError } from '../src/common/errors';

/**
 * Ledger integration tests.
 *
 * These run against a real Postgres schema on purpose: the guarantees under
 * test (unique-constraint idempotency, SERIALIZABLE isolation, zero-sum
 * enforcement) are database behaviours, and a mock would assert nothing.
 */
describe('LedgerService', () => {
  let prisma: PrismaService;
  let ledger: LedgerService;
  let userId: string;

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
    ledger = new LedgerService(prisma);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    // Order matters: entries reference accounts and transactions.
    await prisma.ledgerEntry.deleteMany();
    await prisma.ledgerTransaction.deleteMany();
    await prisma.ledgerAccount.deleteMany();
    await prisma.session.deleteMany();
    await prisma.user.deleteMany();

    const user = await prisma.user.create({
      data: { email: `ledger-${Date.now()}@test.dev`, passwordHash: 'x' },
      select: { id: true },
    });
    userId = user.id;
    await ledger.ensureUserAccounts(userId);
  });

  describe('invariant: transactions must net to zero', () => {
    it('rejects an unbalanced transaction', async () => {
      const available = await ledger.ensureAccount(LedgerAccountKind.USER_AVAILABLE, userId);
      const clearing = await ledger.ensureAccount(LedgerAccountKind.SYSTEM_DEPOSIT_CLEARING, null);

      await expect(
        ledger.post({
          type: LedgerTransactionType.DEPOSIT_CONFIRMED,
          idempotencyKey: 'unbalanced-test',
          entries: [
            { accountId: clearing, direction: LedgerDirection.DEBIT, amount: 100n },
            { accountId: available, direction: LedgerDirection.CREDIT, amount: 999n },
          ],
        }),
      ).rejects.toThrow(LedgerImbalanceError);

      // Nothing may be persisted from a rejected posting.
      expect(await prisma.ledgerTransaction.count()).toBe(0);
      expect(await prisma.ledgerEntry.count()).toBe(0);
    });

    it('rejects a single-sided transaction', async () => {
      const available = await ledger.ensureAccount(LedgerAccountKind.USER_AVAILABLE, userId);

      await expect(
        ledger.post({
          type: LedgerTransactionType.DEPOSIT_CONFIRMED,
          idempotencyKey: 'one-sided',
          entries: [{ accountId: available, direction: LedgerDirection.CREDIT, amount: 100n }],
        }),
      ).rejects.toThrow(LedgerImbalanceError);
    });

    it('rejects a negative or zero amount', async () => {
      const available = await ledger.ensureAccount(LedgerAccountKind.USER_AVAILABLE, userId);
      const clearing = await ledger.ensureAccount(LedgerAccountKind.SYSTEM_DEPOSIT_CLEARING, null);

      await expect(
        ledger.post({
          type: LedgerTransactionType.DEPOSIT_CONFIRMED,
          idempotencyKey: 'negative',
          entries: [
            { accountId: clearing, direction: LedgerDirection.DEBIT, amount: -100n },
            { accountId: available, direction: LedgerDirection.CREDIT, amount: -100n },
          ],
        }),
      ).rejects.toThrow(LedgerImbalanceError);
    });
  });

  describe('deposits', () => {
    it('credits a confirmed deposit to available balance', async () => {
      await ledger.creditDeposit({ userId, depositId: 'dep-1', amount: 1_000_000_000n });

      const balance = await ledger.getBalance(userId);
      expect(balance.available).toBe(1_000_000_000n);
      expect(balance.held).toBe(0n);
      expect(balance.total).toBe(1_000_000_000n);
    });

    it('never credits the same deposit twice', async () => {
      const first = await ledger.creditDeposit({ userId, depositId: 'dep-1', amount: 500_000_000n });
      const second = await ledger.creditDeposit({ userId, depositId: 'dep-1', amount: 500_000_000n });

      expect(second).toBe(first);
      expect((await ledger.getBalance(userId)).available).toBe(500_000_000n);
      expect(await prisma.ledgerTransaction.count()).toBe(1);
    });

    it('is safe under concurrent duplicate credits', async () => {
      // Simulates a webhook and the reconciliation sweep landing together.
      const results = await Promise.all(
        Array.from({ length: 8 }, () =>
          ledger.creditDeposit({ userId, depositId: 'race', amount: 250_000_000n }),
        ),
      );

      expect(new Set(results).size).toBe(1);
      expect((await ledger.getBalance(userId)).available).toBe(250_000_000n);
    });
  });

  describe('authorization holds', () => {
    beforeEach(async () => {
      await ledger.creditDeposit({ userId, depositId: 'funding', amount: 1_000_000_000n });
    });

    it('moves funds from available to held', async () => {
      await ledger.placeHold({ userId, idempotencyKey: 'auth-1', amount: 100_000_000n });

      const balance = await ledger.getBalance(userId);
      expect(balance.available).toBe(900_000_000n);
      expect(balance.held).toBe(100_000_000n);
      // Conservation: nothing is created or destroyed by a hold.
      expect(balance.total).toBe(1_000_000_000n);
    });

    it('refuses a hold that would overdraw', async () => {
      await expect(
        ledger.placeHold({ userId, idempotencyKey: 'auth-big', amount: 2_000_000_000n }),
      ).rejects.toThrow(InsufficientBalanceError);

      expect((await ledger.getBalance(userId)).available).toBe(1_000_000_000n);
    });

    it('returns the original decision when the same authorization is replayed', async () => {
      const first = await ledger.placeHold({ userId, idempotencyKey: 'auth-dup', amount: 50_000_000n });
      const second = await ledger.placeHold({ userId, idempotencyKey: 'auth-dup', amount: 50_000_000n });

      expect(second.ledgerTransactionId).toBe(first.ledgerTransactionId);
      expect((await ledger.getBalance(userId)).held).toBe(50_000_000n);
    });

    it('does not let concurrent holds across cards overdraw one balance', async () => {
      // The core promise of the product: five cards, one balance. Each hold is
      // 300 USDT against a 1,000 USDT balance, so at most three may succeed.
      const attempts = await Promise.allSettled(
        Array.from({ length: 5 }, (_, i) =>
          ledger.placeHold({
            userId,
            idempotencyKey: `concurrent-${i}`,
            amount: 300_000_000n,
          }),
        ),
      );

      const succeeded = attempts.filter((a) => a.status === 'fulfilled').length;
      expect(succeeded).toBeLessThanOrEqual(3);

      const balance = await ledger.getBalance(userId);
      expect(balance.available).toBeGreaterThanOrEqual(0n);
      expect(balance.total).toBe(1_000_000_000n);
    });

    it('releases a hold back to available', async () => {
      await ledger.placeHold({ userId, idempotencyKey: 'auth-2', amount: 100_000_000n });
      await ledger.releaseHold({ userId, idempotencyKey: 'release-2', amount: 100_000_000n });

      const balance = await ledger.getBalance(userId);
      expect(balance.available).toBe(1_000_000_000n);
      expect(balance.held).toBe(0n);
    });
  });

  describe('settlement', () => {
    beforeEach(async () => {
      await ledger.creditDeposit({ userId, depositId: 'funding', amount: 1_000_000_000n });
      await ledger.placeHold({ userId, idempotencyKey: 'auth-s', amount: 100_000_000n });
    });

    it('settles the exact held amount', async () => {
      await ledger.settleAuthorization({
        userId,
        idempotencyKey: 'settle-1',
        heldAmount: 100_000_000n,
        settledAmount: 100_000_000n,
      });

      const balance = await ledger.getBalance(userId);
      expect(balance.held).toBe(0n);
      expect(balance.available).toBe(900_000_000n);
    });

    it('returns the unused portion of an over-hold (fuel/tip pattern)', async () => {
      await ledger.settleAuthorization({
        userId,
        idempotencyKey: 'settle-partial',
        heldAmount: 100_000_000n,
        settledAmount: 60_000_000n,
      });

      const balance = await ledger.getBalance(userId);
      expect(balance.held).toBe(0n);
      expect(balance.available).toBe(940_000_000n);
      expect(balance.total).toBe(940_000_000n);
    });

    it('takes the excess from available on an over-capture', async () => {
      await ledger.settleAuthorization({
        userId,
        idempotencyKey: 'settle-over',
        heldAmount: 100_000_000n,
        settledAmount: 120_000_000n,
      });

      const balance = await ledger.getBalance(userId);
      expect(balance.held).toBe(0n);
      expect(balance.available).toBe(880_000_000n);
    });
  });

  describe('admin adjustments', () => {
    it('credits via balanced entries rather than setting a balance', async () => {
      await ledger.postAdjustment({
        userId,
        idempotencyKey: 'adj-1',
        amount: 100_000_000n,
        reason: 'goodwill credit',
        adminUserId: 'admin-1',
      });

      expect((await ledger.getBalance(userId)).available).toBe(100_000_000n);

      const entries = await prisma.ledgerEntry.findMany({
        where: { transaction: { idempotencyKey: 'adj-1' } },
      });
      expect(entries).toHaveLength(2);
    });

    it('refuses a debit that would push the balance negative', async () => {
      await ledger.creditDeposit({ userId, depositId: 'd', amount: 50_000_000n });

      await expect(
        ledger.postAdjustment({
          userId,
          idempotencyKey: 'adj-neg',
          amount: -100_000_000n,
          reason: 'too much',
          adminUserId: 'admin-1',
        }),
      ).rejects.toThrow(InsufficientBalanceError);

      expect((await ledger.getBalance(userId)).available).toBe(50_000_000n);
    });

    it('rejects a zero adjustment', async () => {
      await expect(
        ledger.postAdjustment({
          userId,
          idempotencyKey: 'adj-zero',
          amount: 0n,
          reason: 'nothing',
          adminUserId: 'admin-1',
        }),
      ).rejects.toThrow(LedgerImbalanceError);
    });
  });

  describe('integrity verification', () => {
    it('reports a healthy ledger after a full lifecycle', async () => {
      await ledger.creditDeposit({ userId, depositId: 'd1', amount: 1_000_000_000n });
      await ledger.placeHold({ userId, idempotencyKey: 'a1', amount: 200_000_000n });
      await ledger.settleAuthorization({
        userId,
        idempotencyKey: 's1',
        heldAmount: 200_000_000n,
        settledAmount: 150_000_000n,
      });
      await ledger.creditRefund({ userId, idempotencyKey: 'r1', amount: 50_000_000n });

      const result = await ledger.verifyIntegrity();
      expect(result.ok).toBe(true);
      expect(result.unbalanced).toHaveLength(0);
      expect(result.negativeBalances).toHaveLength(0);

      const balance = await ledger.getBalance(userId);
      // 1000 deposited - 150 settled + 50 refunded
      expect(balance.available).toBe(900_000_000n);
      expect(balance.held).toBe(0n);
    });

    it('detects an unbalanced transaction written behind the service', async () => {
      // Simulates corruption or a bad migration reaching the table directly.
      const available = await ledger.ensureAccount(LedgerAccountKind.USER_AVAILABLE, userId);
      const raw = new PrismaClient();
      await raw.$connect();
      await raw.ledgerTransaction.create({
        data: {
          type: LedgerTransactionType.DEPOSIT_CONFIRMED,
          idempotencyKey: 'corrupt-1',
          entries: {
            create: [
              { accountId: available, direction: LedgerDirection.CREDIT, amount: 1_000n },
            ],
          },
        },
      });
      await raw.$disconnect();

      const result = await ledger.verifyIntegrity();
      expect(result.ok).toBe(false);
      expect(result.unbalanced).toHaveLength(1);
    });
  });
});
