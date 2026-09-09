/**
 * Give a development account everything it needs to exercise the product.
 *
 *   npm run account:setup -- --email you@example.com [--balance 25000] [--plan BUSINESS]
 *
 * Development only. It refuses to run against APP_ENV=production, because the
 * whole point is to hand out verification and balance that were never earned.
 *
 * The balance is credited through the real ledger, as a demo deposit with its
 * own idempotency key — not by writing a number anywhere. There is no balance
 * column to write to, and inventing one would defeat the design. Run it twice
 * and the second run credits nothing, because the ledger refuses a duplicate
 * key. Pass a different --ref to top up again.
 */
import { LedgerAccountKind, PrismaClient, UserPlan } from '@prisma/client';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

for (const candidate of ['.env', '../../.env']) {
  const path = resolve(process.cwd(), candidate);
  if (existsSync(path)) {
    process.loadEnvFile(path);
    break;
  }
}

const prisma = new PrismaClient();

function arg(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? undefined : process.argv[index + 1];
}

/** USDT is 6dp. "25000" -> 25_000_000_000 minor units. */
function toMinor(whole: string): bigint {
  const [unit, fraction = ''] = whole.trim().split('.');
  if (!/^\d+$/.test(unit) || !/^\d*$/.test(fraction)) {
    throw new Error(`Not a number: ${whole}`);
  }
  return BigInt(`${unit}${fraction.padEnd(6, '0').slice(0, 6)}`);
}

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

async function main(): Promise<void> {
  if (process.env.APP_ENV === 'production') {
    throw new Error('Refusing to run against APP_ENV=production.');
  }

  const email = arg('email');
  if (!email) throw new Error('Pass --email');

  const amount = toMinor(arg('balance') ?? '25000');
  const plan = (arg('plan') ?? 'BUSINESS') as UserPlan;
  const ref = arg('ref') ?? 'setup-1';

  const user = await prisma.user.findUnique({
    where: { email: email.toLowerCase() },
    select: { id: true, email: true, plan: true },
  });
  if (!user) throw new Error(`No account for ${email}. Sign up first, then re-run this.`);

  // 1. Verified, active, and on an uncapped plan.
  await prisma.user.update({
    where: { id: user.id },
    data: {
      status: 'ACTIVE',
      plan,
      planDunningSince: null,
      emailVerifiedAt: new Date(),
    },
  });

  await prisma.accountHolder.upsert({
    where: { userId: user.id },
    create: { userId: user.id, status: 'ACCEPTED' },
    update: { status: 'ACCEPTED' },
  });

  // 2. A wallet, so a deposit address can be issued.
  await prisma.wallet.upsert({
    where: { userId: user.id },
    create: { userId: user.id },
    update: {},
  });

  // 3. Balance, credited the way every other deposit is: a balanced posting
  //    against deposit clearing, with an idempotency key.
  const idempotencyKey = `demo-setup:${user.id}:${ref}`;
  const already = await prisma.ledgerTransaction.findUnique({
    where: { idempotencyKey },
    select: { id: true },
  });

  if (already) {
    console.log(`  balance:   already credited under ref "${ref}" — pass --ref to add more`);
  } else {
    const availableId = await ensureAccount(LedgerAccountKind.USER_AVAILABLE, user.id);
    const clearingId = await ensureAccount(LedgerAccountKind.SYSTEM_DEPOSIT_CLEARING, null);

    await prisma.ledgerTransaction.create({
      data: {
        type: 'DEPOSIT_CONFIRMED',
        idempotencyKey,
        description: 'Development balance for testing — not a real deposit',
        metadata: { source: 'setup-test-account', ref },
        entries: {
          create: [
            { accountId: clearingId, direction: 'DEBIT', amount, currency: 'USDT' },
            { accountId: availableId, direction: 'CREDIT', amount, currency: 'USDT' },
          ],
        },
      },
    });
  }

  const availableId = await ensureAccount(LedgerAccountKind.USER_AVAILABLE, user.id);
  const rows = await prisma.ledgerEntry.groupBy({
    by: ['direction'],
    where: { accountId: availableId },
    _sum: { amount: true },
  });
  const balance = rows.reduce(
    (total, row) => total + (row.direction === 'CREDIT' ? (row._sum.amount ?? 0n) : -(row._sum.amount ?? 0n)),
    0n,
  );

  console.log(`\n  ${user.email}`);
  console.log(`  plan:      ${user.plan} -> ${plan}`);
  console.log('  kyc:       ACCEPTED');
  console.log('  email:     verified');
  console.log(`  available: ${(Number(balance) / 1_000_000).toFixed(2)} USDT\n`);
}

main()
  .catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(() => void prisma.$disconnect());
