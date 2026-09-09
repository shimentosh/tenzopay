'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Panel, PanelHeader, EmptyState, Skeleton, Badge } from '@/components/ui/primitives';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { formatDateTime, money } from '@/lib/utils';

interface Revenue {
  days: number;
  currency: string;
  lifetime: string;
  window: { total: string; count: number };
  byType: { type: string; amount: string; count: number }[];
  series: { date: string; amount: string }[];
  recent: {
    id: string;
    type: string;
    amount: string;
    currency: string;
    description: string | null;
    createdAt: string;
    ledgerTransactionId: string | null;
  }[];
  costDrivers: {
    cardsIssued: number;
    transactionsSettled: number;
    depositsConfirmed: number;
    webhooksReceived: number;
  };
}

const ranges = [7, 30, 90] as const;

const typeLabel: Record<string, string> = {
  DEPOSIT: 'Deposit fees',
  CARD_ISSUANCE: 'Card issuance',
  FX: 'FX margin',
  MONTHLY: 'Monthly plan',
};

/**
 * Revenue.
 *
 * The lifetime figure is the SYSTEM_FEE_REVENUE ledger balance — authoritative,
 * because it is derived from balanced postings. Everything broken down by type
 * or by day comes from the `fees` table. The two are shown together on purpose:
 * if they disagree for the same period, a fee was recorded without a matching
 * posting, and that is worth finding.
 */
export default function RevenuePage() {
  const [days, setDays] = useState<number>(30);

  const { data, isLoading } = useQuery({
    queryKey: ['admin-revenue', days],
    queryFn: () => api.get<Revenue>(`/admin/revenue?days=${days}`),
  });

  const peak = data?.series.reduce((max, point) => {
    const value = BigInt(point.amount);
    return value > max ? value : max;
  }, 0n);

  return (
    <div className="space-y-5">
      <Panel>
        <PanelHeader
          title="Revenue"
          description="Fees charged, by type and over time. Read from the ledger, not estimated."
          action={
            <Tabs value={String(days)} onValueChange={(value) => setDays(Number(value))}>
              <TabsList>
                {ranges.map((range) => (
                  <TabsTrigger key={range} value={String(range)}>
                    {range} days
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
          }
        />

        <div className="grid gap-6 p-5 sm:grid-cols-2">
          <div>
            <p className="text-ui text-content-tertiary">Lifetime fee revenue</p>
            {isLoading ? (
              <Skeleton className="mt-2 h-8 w-40" />
            ) : (
              <p className="tnum mt-2 text-display font-semibold text-content-primary">
                {money(data?.lifetime ?? '0')}
                <span className="ml-1.5 text-value font-normal text-content-tertiary">
                  {data?.currency ?? 'USDT'}
                </span>
              </p>
            )}
            <p className="mt-1 text-caption text-content-tertiary">
              Balance of the SYSTEM_FEE_REVENUE account
            </p>
          </div>

          <div>
            <p className="text-ui text-content-tertiary">Charged in the last {days} days</p>
            {isLoading ? (
              <Skeleton className="mt-2 h-8 w-40" />
            ) : (
              <p className="tnum mt-2 text-display font-semibold text-content-primary">
                {money(data?.window.total ?? '0')}
                <span className="ml-1.5 text-value font-normal text-content-tertiary">
                  {data?.currency ?? 'USDT'}
                </span>
              </p>
            )}
            <p className="mt-1 text-caption text-content-tertiary">
              Across {data?.window.count ?? 0} fee{data?.window.count === 1 ? '' : 's'}
            </p>
          </div>
        </div>
      </Panel>

      <Panel>
        <PanelHeader title="By type" description={`Last ${days} days.`} />
        {isLoading ? (
          <div className="space-y-2 p-5">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : data?.byType.length ? (
          <ul className="divide-y divide-hairline">
            {data.byType.map((row) => (
              <li
                key={row.type}
                className="flex items-center justify-between gap-4 px-5 py-3.5"
              >
                <div className="min-w-0">
                  <p className="text-ui font-semibold text-content-primary">
                    {typeLabel[row.type] ?? row.type}
                  </p>
                  <p className="mt-0.5 text-caption text-content-tertiary">
                    {row.count} charge{row.count === 1 ? '' : 's'}
                  </p>
                </div>
                <span className="tnum text-value font-semibold text-content-primary">
                  {money(row.amount)}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState
            title="No fees charged in this period"
            description="Nothing has been posted to the fee revenue account yet."
          />
        )}
      </Panel>

      <Panel>
        <PanelHeader title="Daily" description={`Fees charged per day, last ${days} days.`} />
        {isLoading ? (
          <div className="p-5">
            <Skeleton className="h-40 w-full" />
          </div>
        ) : data?.series.length ? (
          <div className="p-5">
            {/* A bar per day, sized against the peak. No chart library needed
                for one series, and it stays readable at any width. */}
            <div className="flex h-40 items-end gap-1">
              {data.series.map((point) => {
                const value = BigInt(point.amount);
                const height =
                  peak && peak > 0n ? Number((value * 100n) / peak) : 0;
                return (
                  <div
                    key={point.date}
                    className="group relative flex-1"
                    style={{ height: '100%' }}
                  >
                    <div
                      className="absolute bottom-0 w-full rounded-t bg-brand"
                      style={{ height: `${Math.max(height, 2)}%` }}
                    />
                    <span className="pointer-events-none absolute bottom-full left-1/2 mb-1 hidden -translate-x-1/2 whitespace-nowrap rounded bg-content-primary px-2 py-1 text-caption text-surface-page group-hover:block">
                      {point.date} · {money(point.amount)}
                    </span>
                  </div>
                );
              })}
            </div>
            <div className="mt-2 flex justify-between text-caption text-content-tertiary">
              <span>{data.series[0]?.date}</span>
              <span>{data.series[data.series.length - 1]?.date}</span>
            </div>
          </div>
        ) : (
          <EmptyState title="Nothing charged in this period" />
        )}
      </Panel>

      <Panel>
        <PanelHeader
          title="Cost drivers"
          description="What providers bill for. Counts only — no unit price is stored anywhere in this system, so cost is deliberately not guessed at."
        />
        {isLoading ? (
          <div className="grid gap-4 p-5 sm:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-16 w-full" />
            ))}
          </div>
        ) : (
          <div className="grid gap-4 p-5 sm:grid-cols-4">
            <Driver label="Cards issued" value={data?.costDrivers.cardsIssued ?? 0} />
            <Driver
              label="Transactions settled"
              value={data?.costDrivers.transactionsSettled ?? 0}
            />
            <Driver
              label="Deposits confirmed"
              value={data?.costDrivers.depositsConfirmed ?? 0}
            />
            <Driver
              label="Webhooks received"
              value={data?.costDrivers.webhooksReceived ?? 0}
            />
          </div>
        )}
      </Panel>

      <Panel>
        <PanelHeader title="Recent fees" description="The ten most recent charges." />
        {isLoading ? (
          <div className="space-y-2 p-5">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-14 w-full" />
            ))}
          </div>
        ) : data?.recent.length ? (
          <ul className="divide-y divide-hairline">
            {data.recent.map((fee) => (
              <li key={fee.id} className="flex items-center justify-between gap-4 px-5 py-3.5">
                <div className="min-w-0">
                  <p className="flex items-center gap-2 text-ui font-semibold text-content-primary">
                    {typeLabel[fee.type] ?? fee.type}
                    {!fee.ledgerTransactionId ? (
                      <Badge tone="warning">Not posted</Badge>
                    ) : null}
                  </p>
                  <p className="mt-0.5 truncate text-caption text-content-tertiary">
                    {fee.description ?? '—'} · {formatDateTime(fee.createdAt)}
                  </p>
                </div>
                <span className="tnum text-value font-semibold text-content-primary">
                  {money(fee.amount)} {fee.currency}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState title="No fees yet" />
        )}
      </Panel>
    </div>
  );
}

function Driver({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-card bg-surface-raised px-4 py-3.5">
      <p className="text-caption text-content-tertiary">{label}</p>
      <p className="tnum mt-1 text-subtitle font-semibold text-content-primary">{value}</p>
    </div>
  );
}
