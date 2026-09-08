/**
 * Seed script.
 *
 * Creates the admin roster and one demo customer with a realistic history:
 * a confirmed deposit, two cards, and settled card transactions — all posted
 * through the real ledger, so the demo data obeys the same invariants as
 * production data. Nothing here writes a balance directly.
 *
 * Idempotent: safe to run repeatedly.
 */
import {
  AdminRole,
  CardStatus,
  CardTransactionStatus,
  DepositSource,
  DepositStatus,
  LedgerAccountKind,
  LedgerDirection,
  LedgerTransactionType,
  PrismaClient,
  SpendLimitDuration,
  UserStatus,
} from '@prisma/client';
import * as argon2 from 'argon2';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

// The Prisma CLI loads .env for `migrate`, but a plain `tsx` run does not.
for (const candidate of ['.env', '../../.env']) {
  const path = resolve(process.cwd(), candidate);
  if (existsSync(path)) {
    process.loadEnvFile(path);
    break;
  }
}

const prisma = new PrismaClient();

const ARGON: argon2.Options = {
  type: argon2.argon2id,
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
};

const env = {
  adminEmail: process.env.SEED_ADMIN_EMAIL ?? 'admin@tenzopay.dev',
  adminPassword: process.env.SEED_ADMIN_PASSWORD ?? 'ChangeMe!2026',
  demoEmail: process.env.SEED_DEMO_USER_EMAIL ?? 'demo@tenzopay.dev',
  demoPassword: process.env.SEED_DEMO_USER_PASSWORD ?? 'ChangeMe!2026',
};

async function ensureAccount(
  kind: LedgerAccountKind,
  userId: string | null,
  currency = 'USDT',
): Promise<string> {
  const existing = await prisma.ledgerAccount.findFirst({
    where: { kind, userId, currency },
    select: { id: true },
  });
  if (existing) return existing.id;

  const created = await prisma.ledgerAccount.create({
    data: { kind, userId, currency },
    select: { id: true },
  });
  return created.id;
}

/** Post a balanced pair. Mirrors LedgerService.post, including its zero-sum rule. */
async function postPair(params: {
  type: LedgerTransactionType;
  idempotencyKey: string;
  description: string;
  debitAccountId: string;
  creditAccountId: string;
  amount: bigint;
}): Promise<string | null> {
  const existing = await prisma.ledgerTransaction.findUnique({
    where: { idempotencyKey: params.idempotencyKey },
    select: { id: true },
  });
  if (existing) return existing.id;

  const created = await prisma.ledgerTransaction.create({
    data: {
      type: params.type,
      idempotencyKey: params.idempotencyKey,
      description: params.description,
      entries: {
        create: [
          {
            accountId: params.debitAccountId,
            direction: LedgerDirection.DEBIT,
            amount: params.amount,
          },
          {
            accountId: params.creditAccountId,
            direction: LedgerDirection.CREDIT,
            amount: params.amount,
          },
        ],
      },
    },
    select: { id: true },
  });
  return created.id;
}

async function seedAdmins(): Promise<void> {
  const roster: { email: string; name: string; role: AdminRole }[] = [
    { email: env.adminEmail, name: 'Super Admin', role: AdminRole.SUPER_ADMIN },
    { email: 'finance@tenzopay.dev', name: 'Frances Ops', role: AdminRole.FINANCE },
    { email: 'risk@tenzopay.dev', name: 'Riley Kade', role: AdminRole.RISK },
    { email: 'support@tenzopay.dev', name: 'Sam Porter', role: AdminRole.SUPPORT },
  ];

  const passwordHash = await argon2.hash(env.adminPassword, ARGON);

  for (const member of roster) {
    await prisma.adminUser.upsert({
      where: { email: member.email },
      create: { ...member, passwordHash },
      update: { role: member.role, name: member.name },
    });
  }

  console.log(`  admins: ${roster.length} (password: ${env.adminPassword})`);
}

async function seedDemoUser(): Promise<void> {
  const passwordHash = await argon2.hash(env.demoPassword, ARGON);

  const user = await prisma.user.upsert({
    where: { email: env.demoEmail },
    create: {
      email: env.demoEmail,
      passwordHash,
      firstName: 'Ada',
      lastName: 'Whitfield',
      phoneNumber: '+15555550142',
      status: UserStatus.ACTIVE,
      emailVerifiedAt: new Date(),
      wallet: { create: {} },
    },
    update: {},
    select: { id: true },
  });

  await prisma.accountHolder.upsert({
    where: { userId: user.id },
    create: {
      userId: user.id,
      providerName: 'seed',
      providerAccountHolderToken: `seed-holder-${user.id}`,
      providerAccountToken: `seed-account-${user.id}`,
      status: 'ACCEPTED',
      workflow: 'KYC_BASIC',
    },
    update: {},
  });

  const wallet = await prisma.wallet.findUniqueOrThrow({
    where: { userId: user.id },
    select: { id: true },
  });

  // --- Ledger accounts ----------------------------------------------------
  const available = await ensureAccount(LedgerAccountKind.USER_AVAILABLE, user.id);
  const held = await ensureAccount(LedgerAccountKind.USER_HELD, user.id);
  const clearing = await ensureAccount(LedgerAccountKind.SYSTEM_DEPOSIT_CLEARING, null);
  const settlement = await ensureAccount(LedgerAccountKind.SYSTEM_CARD_SETTLEMENT, null);

  // --- A confirmed deposit of 12,500 USDT ---------------------------------
  const depositAmount = 12_500_000_000n; // 12,500.000000 USDT

  const address = await prisma.depositAddress.upsert({
    where: { walletId_network: { walletId: wallet.id, network: 'ETHEREUM_SEPOLIA' } },
    create: {
      walletId: wallet.id,
      network: 'ETHEREUM_SEPOLIA',
      address: '0x7a3f9c1e5b8d2a604f7e9c3b1d5a8f2e6c0b4d97',
      derivationIndex: 0,
      isDemo: true,
    },
    update: {},
  });

  const txHash =
    '0x9f2c4e7a1b8d3f60c5a2e8b41d7f93a6c0e5b28d4f1a7c93e6b0d582af41c7e9';

  const existingDeposit = await prisma.deposit.findFirst({
    where: { userId: user.id, txHash },
    select: { id: true },
  });

  if (!existingDeposit) {
    const ledgerTransactionId = await postPair({
      type: LedgerTransactionType.DEPOSIT_CONFIRMED,
      idempotencyKey: `seed:deposit:${user.id}`,
      description: 'USDT deposit confirmed (seed)',
      debitAccountId: clearing,
      creditAccountId: available,
      amount: depositAmount,
    });

    await prisma.deposit.create({
      data: {
        userId: user.id,
        addressId: address.id,
        network: 'ETHEREUM_SEPOLIA',
        amount: depositAmount,
        status: DepositStatus.CONFIRMED,
        source: DepositSource.DEMO,
        txHash,
        logIndex: 0,
        fromAddress: '0x1c4e8b2f6a9d3e705c8b1f4a7d2e9c6b3a0f5d84',
        toAddress: address.address,
        contractAddress: '0xdac17f958d2ee523a2206206994597c13d831ec7',
        blockNumber: 6_012_345n,
        confirmations: 42,
        requiredConfirmations: 12,
        detectedAt: new Date(Date.now() - 6 * 86_400_000),
        confirmedAt: new Date(Date.now() - 6 * 86_400_000 + 180_000),
        ledgerTransactionId,
      },
    });
  }

  // --- Cards --------------------------------------------------------------
  const cardSpecs = [
    {
      name: 'Marketing',
      lastFour: '4821',
      daily: 50_000n,      // $500.00
      monthly: 500_000n,   // $5,000.00
      perTx: 25_000n,      // $250.00
      status: CardStatus.ACTIVE,
    },
    {
      name: 'SaaS Subscriptions',
      lastFour: '1179',
      daily: 10_000n,
      monthly: 120_000n,
      perTx: 10_000n,
      status: CardStatus.ACTIVE,
    },
    {
      name: 'Travel',
      lastFour: '6034',
      daily: 100_000n,
      monthly: 800_000n,
      perTx: 100_000n,
      status: CardStatus.FROZEN,
    },
  ];

  const merchants = [
    ['Meta Ads', '7311'],
    ['Google Ads', '7311'],
    ['Figma', '5734'],
    ['Vercel', '5734'],
    ['Notion Labs', '5734'],
    ['Delta Air Lines', '3058'],
    ['Blue Bottle Coffee', '5812'],
  ] as const;

  for (const [index, spec] of cardSpecs.entries()) {
    const cardToken = `seed-card-${user.id}-${index}`;

    const card = await prisma.card.upsert({
      where: { providerCardToken: cardToken },
      create: {
        userId: user.id,
        name: spec.name,
        providerName: 'seed',
        providerCardToken: cardToken,
        providerAccountToken: `seed-account-${user.id}`,
        lastFour: spec.lastFour,
        expMonth: '09',
        expYear: String(new Date().getFullYear() + 4),
        network: 'VISA',
        cardType: 'VIRTUAL',
        status: spec.status,
        spendLimit: spec.monthly,
        spendLimitDuration: SpendLimitDuration.MONTHLY,
        dailyLimit: spec.daily,
        monthlyLimit: spec.monthly,
        perTransactionLimit: spec.perTx,
        lastSyncedAt: new Date(),
      },
      update: {},
      select: { id: true },
    });

    // Settled transactions, each posted through the ledger like a real one.
    for (let i = 0; i < 4; i++) {
      const [merchantName, mcc] = merchants[(index * 3 + i) % merchants.length];
      const token = `seed-txn-${card.id}-${i}`;

      const alreadyThere = await prisma.cardTransaction.findUnique({
        where: { providerTransactionToken: token },
        select: { id: true },
      });
      if (alreadyThere) continue;

      // Deterministic pseudo-amount so the demo data is stable across runs.
      const amountCents = BigInt(1200 + ((index + 1) * (i + 3) * 917) % 18_000);
      const amountUsdt = amountCents * 10_000n;
      const daysAgo = i + index;

      const settleId = await postPair({
        type: LedgerTransactionType.CARD_SETTLEMENT,
        idempotencyKey: `seed:settle:${token}`,
        description: `Card settlement — ${merchantName}`,
        debitAccountId: available,
        creditAccountId: settlement,
        amount: amountUsdt,
      });

      await prisma.cardTransaction.create({
        data: {
          cardId: card.id,
          userId: user.id,
          providerTransactionToken: token,
          status: CardTransactionStatus.SETTLED,
          amount: amountCents,
          settledAmount: amountCents,
          currency: 'USD',
          merchantName,
          mcc,
          merchantCountry: 'USA',
          networkResult: 'APPROVED',
          authorizedAt: new Date(Date.now() - daysAgo * 86_400_000),
          settledAt: new Date(Date.now() - daysAgo * 86_400_000 + 7_200_000),
          settleLedgerTransactionId: settleId,
          createdAt: new Date(Date.now() - daysAgo * 86_400_000),
        },
      });
    }
  }

  // --- One outstanding authorization, so `held` is non-zero ---------------
  const pendingToken = `seed-txn-pending-${user.id}`;
  const pendingExists = await prisma.cardTransaction.findUnique({
    where: { providerTransactionToken: pendingToken },
    select: { id: true },
  });

  if (!pendingExists) {
    const firstCard = await prisma.card.findFirstOrThrow({
      where: { userId: user.id, status: CardStatus.ACTIVE },
      select: { id: true, name: true },
    });

    const pendingCents = 8_450n; // $84.50
    await postPair({
      type: LedgerTransactionType.CARD_AUTHORIZATION,
      idempotencyKey: `seed:auth:${pendingToken}`,
      description: `Card authorization — ${firstCard.name}`,
      debitAccountId: available,
      creditAccountId: held,
      amount: pendingCents * 10_000n,
    });

    await prisma.cardTransaction.create({
      data: {
        cardId: firstCard.id,
        userId: user.id,
        providerTransactionToken: pendingToken,
        status: CardTransactionStatus.PENDING,
        amount: pendingCents,
        currency: 'USD',
        merchantName: 'Amazon Web Services',
        mcc: '7372',
        merchantCountry: 'USA',
        authorizedAt: new Date(Date.now() - 3_600_000),
        createdAt: new Date(Date.now() - 3_600_000),
      },
    });
  }

  // --- Report -------------------------------------------------------------
  const entries = await prisma.ledgerEntry.groupBy({
    by: ['direction'],
    where: { accountId: available },
    _sum: { amount: true },
  });

  const balance = entries.reduce(
    (total, row) =>
      total +
      (row.direction === LedgerDirection.CREDIT
        ? (row._sum.amount ?? 0n)
        : -(row._sum.amount ?? 0n)),
    0n,
  );

  console.log(`  demo user: ${env.demoEmail} (password: ${env.demoPassword})`);
  console.log(`  available balance: ${(Number(balance) / 1e6).toFixed(2)} USDT`);
}

async function main(): Promise<void> {
  console.log('Seeding TenzoPay...');
  await seedAdmins();
  await seedDemoUser();
  console.log('Done.');
}

main()
  .catch((err) => {
    console.error('Seed failed:', err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
