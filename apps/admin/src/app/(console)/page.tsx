'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, CheckCircle2 } from 'lucide-react';
import { api } from '@/lib/api';
import { money } from '@/lib/utils';
import { Alert, Panel, PanelHeader, Skeleton } from '@/components/ui/primitives';

interface Dashboard {
  users: { total: number; verified: number; frozen: number };
  cards: { active: number; frozen: number; closed: number };
  deposits: { totalConfirmed: string; pending: number };
  cardVolume: string;
  failedTransactions: number;
  integrity: {
    ok: boolean;
    checkedTransactions: number;
    unbalanced: string[];
    negativeBalances: string[];
  };
  alerts: { level: 'error' | 'warn'; message: string }[];
}

export default function ConsoleDashboard() {
  const { data, isLoading } = useQuery({
    queryKey: ['admin-dashboard'],
    queryFn: () => api.get<Dashboard>('/admin/dashboard'),
    refetchInterval: 30_000,
  });

  if (isLoading) {
    return (
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} className="h-24 rounded-card" />
        ))}
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div>
        <h1 className="text-subtitle font-semibold tracking-tight text-foreground">
          Operations overview
        </h1>
        <p className="mt-1 text-ui text-muted-foreground">
          Platform health and volumes across all accounts.
        </p>
      </div>

      {/* Ledger integrity is the single most important signal here: if the
          double-entry invariant breaks, nothing else on this page matters. */}
      {data?.integrity.ok ? (
        <div className="flex items-center gap-2.5 rounded-card bg-surface-raised px-4 py-3 text-ui text-content-primary">
          <CheckCircle2 className="size-4 text-positive" aria-hidden />
          Ledger integrity verified across {data.integrity.checkedTransactions}{' '}
          transactions — every entry balances.
        </div>
      ) : (
        <Alert tone="critical" title="Ledger integrity failure">
          {data?.integrity.unbalanced.length ?? 0} unbalanced transaction(s) and{' '}
          {data?.integrity.negativeBalances.length ?? 0} negative balance(s).
          This needs immediate investigation.
        </Alert>
      )}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Total users" value={data?.users.total ?? 0} />
        <Stat
          label="Verified users"
          value={data?.users.verified ?? 0}
          hint={data?.users.frozen ? `${data.users.frozen} frozen` : undefined}
        />
        <Stat
          label="USDT deposited"
          value={money(data?.deposits.totalConfirmed ?? '0')}
          suffix="USDT"
        />
        <Stat
          label="Pending deposits"
          value={data?.deposits.pending ?? 0}
          tone={data?.deposits.pending ? 'warning' : undefined}
        />
        <Stat label="Active cards" value={data?.cards.active ?? 0} />
        <Stat
          label="Frozen cards"
          value={data?.cards.frozen ?? 0}
          tone={data?.cards.frozen ? 'warning' : undefined}
        />
        <Stat
          label="Card volume"
          value={money(data?.cardVolume ?? '0')}
          suffix="USDT"
        />
        <Stat
          label="Declined transactions"
          value={data?.failedTransactions ?? 0}
          tone={data?.failedTransactions ? 'warning' : undefined}
        />
      </div>

      <Panel>
        <PanelHeader
          title="System alerts"
          description="Conditions that may need an operator."
        />
        {data?.alerts.length ? (
          <ul className="divide-y divide-border">
            {data.alerts.map((alert) => (
              <li key={alert.message} className="flex items-start gap-3 px-5 py-3.5">
                <AlertTriangle
                  className={
                    alert.level === 'error'
                      ? 'mt-0.5 size-4 shrink-0 text-destructive'
                      : 'mt-0.5 size-4 shrink-0 text-warning'
                  }
                  aria-hidden
                />
                <p className="text-ui text-foreground/80">{alert.message}</p>
              </li>
            ))}
          </ul>
        ) : (
          <p className="px-5 py-8 text-center text-ui text-muted-foreground">
            No active alerts.
          </p>
        )}
      </Panel>

      <div className="grid gap-4 sm:grid-cols-3">
        <QuickLink href="/deposits" label="Review deposits" />
        <QuickLink href="/webhooks" label="Webhook queue" />
        <QuickLink href="/health" label="System health" />
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  suffix,
  hint,
  tone,
}: {
  label: string;
  value: string | number;
  suffix?: string;
  hint?: string;
  tone?: 'warning';
}) {
  return (
    <Panel className="p-5">
      <p className="text-caption font-semibold text-muted-foreground">
        {label}
      </p>
      <p
        className={`tnum mt-1.5 text-title font-semibold ${
          tone === 'warning' ? 'text-warning' : 'text-foreground'
        }`}
      >
        {value}
        {suffix ? (
          <span className="ml-1.5 text-ui font-semibold text-muted-foreground">{suffix}</span>
        ) : null}
      </p>
      {hint ? <p className="mt-0.5 text-caption text-muted-foreground">{hint}</p> : null}
    </Panel>
  );
}

function QuickLink({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="card-surface px-5 py-4 text-ui font-semibold text-foreground transition-colors hover:border-primary/40 hover:text-primary"
    >
      {label} →
    </Link>
  );
}
