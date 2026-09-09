import Link from 'next/link';
import { ChartNoAxesColumn, CreditCard, Plus, Receipt, Snowflake } from 'lucide-react';
import { serverFetch } from '@/lib/server-api';
import { money } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { StatusBadge } from '@/components/ui/primitives';
import {
  HeroMetric,
  IconButton,
  InfoStrip,
  Nudge,
  SectionHeader,
} from '@/components/ui/patterns';
import { VirtualCard } from '@/components/virtual-card';
import { SpendingChart } from '@/components/app/spending-chart';
import { TransactionList } from '@/components/app/transaction-list';
import type { CardSummary, Paginated, TransactionRow } from '@tenzopay/shared';

export const metadata = { title: 'Overview' };
export const dynamic = 'force-dynamic';

interface Overview {
  balance: { currency: string; available: string; held: string; total: string };
  activeCards: number;
  frozenCards: number;
  pendingDeposits: number;
}

interface KycStatus {
  status: string;
}

export default async function DashboardPage() {
  const [overview, cards, transactions, kyc] = await Promise.all([
    serverFetch<Overview>('/overview'),
    serverFetch<CardSummary[]>('/cards'),
    serverFetch<Paginated<TransactionRow>>('/transactions?limit=6'),
    serverFetch<KycStatus>('/kyc/status'),
  ]);

  const balance = overview?.balance;
  const needsKyc = kyc?.status !== 'ACCEPTED';
  const hasCards = Boolean(cards?.length);

  // Setup progress is derived from real state, never a decorative number.
  const stepsDone = 1 + (needsKyc ? 0 : 1) + (hasCards ? 1 : 0);
  const held = balance && BigInt(balance.held) > 0n;

  return (
    <div className="space-y-10">
      <HeroMetric
        label="Available balance"
        amount={money(balance?.available ?? '0')}
        currency={balance?.currency ?? 'USDT'}
        meta={
          held ? (
            <span className="tnum">
              {money(balance.held)} held by pending authorizations · {money(balance.total)} total
            </span>
          ) : (
            'No pending authorizations'
          )
        }
        controls={
          <IconButton label="See spending" href="/transactions">
            <ChartNoAxesColumn className="size-4" aria-hidden />
          </IconButton>
        }
        actions={
          <>
            {/* The one accent-filled action on this screen. */}
            <Button asChild>
              <Link href="/deposit">
                <Plus aria-hidden />
                Add money
              </Link>
            </Button>
            <Button asChild variant="secondary">
              <Link href="/cards">
                <CreditCard aria-hidden />
                New card
              </Link>
            </Button>
            <Button asChild variant="secondary">
              <Link href="/cards">
                <Snowflake aria-hidden />
                Freeze
              </Link>
            </Button>
            <Button asChild variant="secondary">
              <Link href="/transactions">
                <Receipt aria-hidden />
                Statements
              </Link>
            </Button>
          </>
        }
      />

      {stepsDone < 3 ? (
        <Nudge
          href={needsKyc ? '/onboarding' : '/cards'}
          title={needsKyc ? 'Finish verifying your identity' : 'Create your first card'}
          description={
            needsKyc
              ? 'Verification is needed before you can add money or issue a card.'
              : 'Name a card, set its limits, and it works straight away.'
          }
          done={stepsDone}
          total={3}
        />
      ) : null}

      <InfoStrip
        items={[
          {
            label: 'Active cards',
            value: String(overview?.activeCards ?? 0),
          },
          {
            label: 'Frozen',
            value: String(overview?.frozenCards ?? 0),
          },
          {
            label: 'Pending deposits',
            value: String(overview?.pendingDeposits ?? 0),
          },
        ]}
      />

      <section aria-labelledby="cards-heading" className="space-y-4">
        <div id="cards-heading">
          <SectionHeader title="Your cards" seeAllHref="/cards" />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          {cards?.slice(0, 2).map((card) => (
            <Link
              key={card.id}
              href={`/cards/${card.id}`}
              className="rounded-card outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            >
              <VirtualCard card={card} />
              <div className="mt-3 flex items-center justify-between gap-3 px-0.5">
                <span className="truncate text-ui font-semibold text-content-primary">
                  {card.name}
                </span>
                <StatusBadge status={card.status} />
              </div>
            </Link>
          ))}

          {/* The upsell slot is the same tinted card, never a dashed outline. */}
          {(cards?.length ?? 0) < 2 ? (
            <div className="flex flex-col items-center justify-center gap-3 rounded-card bg-surface-raised px-6 py-12 text-center">
              <p className="text-subtitle font-semibold text-content-primary">
                {hasCards ? 'Add another card' : 'Create your first card'}
              </p>
              <p className="max-w-[26ch] text-ui text-content-tertiary">
                Give each merchant its own card and its own ceiling.
              </p>
              <Link
                href="/cards"
                aria-label="Create a card"
                className="mt-1 inline-flex size-11 items-center justify-center rounded-full bg-brand text-content-on-accent outline-none transition-colors duration-150 ease hover:bg-brand-hover focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
              >
                <Plus className="size-5" aria-hidden />
              </Link>
            </div>
          ) : null}
        </div>
      </section>

      <section aria-labelledby="transactions-heading" className="space-y-2">
        <div id="transactions-heading">
          <SectionHeader title="Transactions" seeAllHref="/transactions" />
        </div>
        <TransactionList rows={transactions?.data ?? []} />
      </section>

      <section aria-labelledby="spending-heading" className="space-y-4">
        <div id="spending-heading">
          <SectionHeader title="Spending" />
        </div>
        <SpendingChart />
      </section>

    </div>
  );
}
