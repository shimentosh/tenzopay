import { beforeAll, afterAll, beforeEach, describe, expect, it } from 'vitest';
import { LedgerAccountKind, UserPlan } from '@prisma/client';
import { PrismaService } from '../src/prisma/prisma.service';
import { LedgerService } from '../src/ledger/ledger.service';
import { BillingService } from '../src/billing/billing.service';
import { SettingsService } from '../src/settings/settings.service';

/**
 * Monthly plan billing.
 *
 * The two things worth guarding: a month is charged exactly once no matter how
 * often the job runs, and an account that cannot pay accrues no debt.
 */
describe('plan billing', () => {
  let prisma: PrismaService;
  let ledger: LedgerService;
  let billing: BillingService;

  const userId = '00000000-0000-4000-8000-0000000000bb';
  const TEAM_PRICE = 19_000_000n; // 19 USDT

  const rates = new Map<string, bigint>([
    ['fee.plan.team', TEAM_PRICE],
    ['billing.dunning_days', 7n],
  ]);

  const settingsStub = {
    get: async (key: string) => rates.get(key) ?? 0n,
    getMany: async (keys: string[]) =>
      Object.fromEntries(keys.map((key) => [key, rates.get(key) ?? 0n])),
  } as unknown as SettingsService;

  async function fund(amount: bigint, seq: string) {
    await ledger.creditDeposit({
      userId,
      depositId: `00000000-0000-4000-8000-0000000000${seq}`,
      amount,
    });
  }

  async function available() {
    const accountId = await ledger.ensureAccount(LedgerAccountKind.USER_AVAILABLE, userId);
    return ledger.getAccountBalance(accountId);
  }

  async function setPlan(plan: UserPlan, dunningSince: Date | null = null) {
    await prisma.user.update({
      where: { id: userId },
      data: { plan, planDunningSince: dunningSince },
    });
  }

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
    ledger = new LedgerService(prisma);
    billing = new BillingService(prisma, ledger, settingsStub);
  });

  afterAll(async () => {
    await prisma.fee.deleteMany({ where: { userId } });
    await prisma.notification.deleteMany({ where: { userId } });
    await prisma.user.delete({ where: { id: userId } }).catch(() => undefined);
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await prisma.notification.deleteMany({ where: { userId } });
    await prisma.fee.deleteMany({ where: { userId } });
    await prisma.ledgerEntry.deleteMany();
    await prisma.ledgerTransaction.deleteMany();
    await prisma.ledgerAccount.deleteMany();
    await prisma.user.upsert({
      where: { id: userId },
      create: { id: userId, email: 'billing@tenzopay.test', passwordHash: 'x' },
      update: { plan: UserPlan.STARTER, planDunningSince: null },
    });
  });

  it('does not charge a Starter account', async () => {
    await fund(50_000_000n, 'b1');
    const result = await billing.chargeDuePlans();

    expect(result.charged).toBe(0);
    expect(await available()).toBe(50_000_000n);
  });

  it('charges a Team account and books it as fee revenue', async () => {
    await fund(50_000_000n, 'b2');
    await setPlan(UserPlan.TEAM);

    const result = await billing.chargeDuePlans();
    expect(result.charged).toBe(1);
    expect(await available()).toBe(50_000_000n - TEAM_PRICE);

    const revenueId = await ledger.ensureAccount(LedgerAccountKind.SYSTEM_FEE_REVENUE, null);
    expect(await ledger.getAccountBalance(revenueId)).toBe(TEAM_PRICE);
  });

  it('charges once a month however often the job runs', async () => {
    await fund(50_000_000n, 'b3');
    await setPlan(UserPlan.TEAM);

    await billing.chargeDuePlans();
    await billing.chargeDuePlans();
    const third = await billing.chargeDuePlans();

    expect(third.charged).toBe(0);
    expect(await available()).toBe(50_000_000n - TEAM_PRICE);
    expect(await prisma.fee.count({ where: { userId } })).toBe(1);
  });

  it('charges the next month separately', async () => {
    await fund(50_000_000n, 'b4');
    await setPlan(UserPlan.TEAM);

    await billing.chargeDuePlans(new Date(Date.UTC(2026, 0, 15)));
    await billing.chargeDuePlans(new Date(Date.UTC(2026, 1, 15)));

    expect(await prisma.fee.count({ where: { userId } })).toBe(2);
    expect(await available()).toBe(50_000_000n - TEAM_PRICE * 2n);
  });

  it('accrues no debt when the balance cannot cover it', async () => {
    await fund(1_000_000n, 'b5'); // less than the plan price
    await setPlan(UserPlan.TEAM);

    const result = await billing.chargeDuePlans();

    expect(result.charged).toBe(0);
    expect(result.retried).toBe(1);
    // Untouched — a subscription that could not be paid must not go negative.
    expect(await available()).toBe(1_000_000n);

    const user = await prisma.user.findUnique({ where: { id: userId } });
    expect(user?.planDunningSince).toBeTruthy();
    expect(user?.plan).toBe(UserPlan.TEAM);
  });

  it('drops to Starter once the retry window has run out', async () => {
    await fund(1_000_000n, 'b6');
    const eightDaysAgo = new Date(Date.now() - 8 * 86_400_000);
    await setPlan(UserPlan.TEAM, eightDaysAgo);

    const result = await billing.chargeDuePlans();

    expect(result.downgraded).toBe(1);
    const user = await prisma.user.findUnique({ where: { id: userId } });
    expect(user?.plan).toBe(UserPlan.STARTER);
    expect(user?.planDunningSince).toBeNull();
    expect(await available()).toBe(1_000_000n);

    const audit = await prisma.auditLog.findFirst({
      where: { entityId: userId, action: 'plan.downgraded' },
    });
    expect(audit).toBeTruthy();
  });

  it('clears the dunning flag once a charge succeeds', async () => {
    await fund(50_000_000n, 'b7');
    await setPlan(UserPlan.TEAM, new Date(Date.now() - 2 * 86_400_000));

    await billing.chargeDuePlans();

    const user = await prisma.user.findUnique({ where: { id: userId } });
    expect(user?.planDunningSince).toBeNull();
  });

  it('skips Business while its price is still zero', async () => {
    await fund(50_000_000n, 'b8');
    await setPlan(UserPlan.BUSINESS);

    const result = await billing.chargeDuePlans();

    expect(result.charged).toBe(0);
    expect(await available()).toBe(50_000_000n);
  });
});
