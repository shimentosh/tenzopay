import Link from 'next/link';
import { ArrowUpRight, CreditCard, Plus } from 'lucide-react';
import { serverFetch } from '@/lib/server-api';
import { money, usd } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Panel, PanelHeader, EmptyState, StatusBadge, Alert } from '@/components/ui/primitives';
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

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      {needsKyc ? (
        <Alert tone="brand" title="Finish verifying your identity">
          <p className="mb-3">
            Identity verification is required before you can deposit funds or
            issue cards.
          </p>
          <Button asChild size="sm">
            <Link href="/onboarding">Continue verification</Link>
          </Button>
        </Alert>
      ) : null}

      {/* ------------------------------------------------ Balance + stats */}
      <section className="grid gap-4 lg:grid-cols-[1.6fr_1fr]">
        <Panel className="relative overflow-hidden p-6">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 bg-[radial-gradient(70%_120%_at_100%_0%,var(--accent),transparent_65%)]"
          />
          <div className="relative">
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Available balance
            </p>
            <p className="tnum mt-2 text-[2.6rem] font-semibold leading-none tracking-tight text-foreground">
              {money(balance?.available ?? '0')}
              <span className="ml-2 text-lg font-medium text-muted-foreground">
                {balance?.currency ?? 'USDT'}
              </span>
            </p>

            {balance && BigInt(balance.held) > 0n ? (
              <p className="tnum mt-2 text-sm text-muted-foreground">
                {money(balance.held)} held by pending authorizations · {' '}
                {money(balance.total)} total
              </p>
            ) : (
              <p className="mt-2 text-sm text-muted-foreground">
                No pending authorizations
              </p>
            )}

            <div className="mt-6 flex flex-wrap gap-2.5">
              <Button asChild>
                <Link href="/deposit">
                  <Plus className="size-4" aria-hidden />
                  Deposit USDT
                </Link>
              </Button>
              <Button asChild variant="secondary">
                <Link href="/cards">
                  <CreditCard className="size-4" aria-hidden />
                  Manage cards
                </Link>
              </Button>
            </div>
          </div>
        </Panel>

        <div className="grid grid-cols-2 gap-4 lg:grid-cols-1">
          <StatTile
            label="Active cards"
            value={String(overview?.activeCards ?? 0)}
            hint={
              overview?.frozenCards
                ? `${overview.frozenCards} frozen`
                : 'All cards active'
            }
          />
          <StatTile
            label="Pending deposits"
            value={String(overview?.pendingDeposits ?? 0)}
            hint={
              overview?.pendingDeposits
                ? 'Awaiting confirmations'
                : 'Nothing in flight'
            }
          />
        </div>
      </section>

      {/* --------------------------------------------------------- Cards */}
      <Panel>
        <PanelHeader
          title="Your cards"
          description="Each card spends from the same balance."
          action={
            <Button asChild size="sm" variant="secondary">
              <Link href="/cards">
                View all
                <ArrowUpRight className="size-4" aria-hidden />
              </Link>
            </Button>
          }
        />

        {cards?.length ? (
          <div className="grid gap-5 p-5 sm:grid-cols-2 xl:grid-cols-3">
            {cards.slice(0, 3).map((card) => (
              <Link
                key={card.id}
                href={`/cards/${card.id}`}
                className="group rounded-2xl transition-transform duration-300 hover:-translate-y-1"
              >
                <VirtualCard card={card} />
                <div className="mt-3 flex items-center justify-between px-0.5">
                  <span className="text-sm font-medium text-foreground">
                    {card.name}
                  </span>
                  <StatusBadge status={card.status} />
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <EmptyState
            icon={<CreditCard className="size-5" />}
            title="No cards yet"
            description="Create a virtual card and give it its own spending limits."
            action={
              <Button asChild size="sm">
                <Link href="/cards">Create a card</Link>
              </Button>
            }
          />
        )}
      </Panel>

      {/* --------------------------------------- Transactions + spending */}
      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <Panel>
          <PanelHeader
            title="Recent transactions"
            action={
              <Button asChild size="sm" variant="ghost">
                <Link href="/transactions">
                  View all
                  <ArrowUpRight className="size-4" aria-hidden />
                </Link>
              </Button>
            }
          />
          <TransactionList rows={transactions?.data ?? []} />
        </Panel>

        <Panel>
          <PanelHeader title="Spending overview" />
          <div className="p-5">
            <SpendingChart />
          </div>
        </Panel>
      </div>
    </div>
  );
}

function StatTile({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint: string;
}) {
  return (
    <Panel className="p-5">
      <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
      <p className="tnum mt-1.5 text-2xl font-semibold text-foreground">{value}</p>
      <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>
    </Panel>
  );
}
