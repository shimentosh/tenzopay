'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, ShieldCheck } from 'lucide-react';
import { api } from '@/lib/api';
import { Panel, PanelHeader, EmptyState, Skeleton, Badge } from '@/components/ui/primitives';
import { money } from '@/lib/utils';

interface Dashboard {
  users: { total: number; verified: number; frozen: number };
  cards: { active: number; frozen: number; closed: number };
  deposits: { totalConfirmed: string; pending: number };
  failedTransactions: number;
  integrity: { ok: boolean; unbalanced: string[]; negativeBalances: string[] };
  alerts: { level: 'error' | 'warn'; message: string }[];
}

/**
 * Risk view.
 *
 * Deliberately modest in scope: it surfaces the signals this system actually
 * computes — declines, frozen accounts, ledger integrity — rather than
 * presenting a fabricated risk score. A real risk engine needs transaction
 * monitoring and sanctions screening, which are named in the architecture doc
 * as unmet dependencies.
 */
export default function RiskPage() {
  const { data, isLoading } = useQuery({
    queryKey: ['admin-dashboard'],
    queryFn: () => api.get<Dashboard>('/admin/dashboard'),
    refetchInterval: 30_000,
  });

  if (isLoading) {
    return (
      <div className="mx-auto max-w-4xl space-y-4">
        <Skeleton className="h-24 rounded-card" />
        <Skeleton className="h-48 rounded-card" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <div className="grid gap-4 sm:grid-cols-3">
        <Metric
          label="Declined transactions"
          value={data?.failedTransactions ?? 0}
          tone={data?.failedTransactions ? 'warning' : 'ok'}
        />
        <Metric
          label="Frozen accounts"
          value={data?.users.frozen ?? 0}
          tone={data?.users.frozen ? 'warning' : 'ok'}
        />
        <Metric
          label="Frozen cards"
          value={data?.cards.frozen ?? 0}
          tone={data?.cards.frozen ? 'warning' : 'ok'}
        />
      </div>

      <Panel>
        <PanelHeader title="Open signals" />
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
                <Badge tone={alert.level === 'error' ? 'critical' : 'warning'} className="ml-auto">
                  {alert.level}
                </Badge>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState
            icon={<ShieldCheck className="size-5" />}
            title="No open signals"
            description="Nothing currently requires review."
          />
        )}
      </Panel>

      <Panel>
        <PanelHeader
          title="Controls in force"
          description="What actually stops a transaction today."
        />
        <ul className="divide-y divide-border text-ui">
          <Control
            title="Shared-balance authorization"
            body="Every authorization is checked against the cardholder's available balance before approval, so multiple cards cannot exceed one balance."
          />
          <Control
            title="Per-card velocity limits"
            body="Daily and monthly limits are enforced by the card issuer on its own infrastructure."
          />
          <Control
            title="Fail-closed decisioning"
            body="If the decision service errors or times out, the authorization is declined rather than approved."
          />
          <Control
            title="Not implemented"
            body="Sanctions screening, PEP checks and automated transaction monitoring require a dedicated AML vendor and are not part of this build."
            missing
          />
        </ul>
      </Panel>

      <p className="text-caption text-muted-foreground">
        Ledger integrity:{' '}
        {data?.integrity.ok ? (
          <span className="font-semibold text-positive">verified</span>
        ) : (
          <Link href="/health" className="font-semibold text-destructive underline">
            failing — investigate
          </Link>
        )}
      </p>
    </div>
  );
}

function Metric({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: 'ok' | 'warning';
}) {
  return (
    <Panel className="p-5">
      <p className="text-caption text-muted-foreground">{label}</p>
      <p
        className={`tnum mt-1.5 text-title font-semibold ${
          tone === 'warning' ? 'text-warning' : 'text-foreground'
        }`}
      >
        {value}
      </p>
    </Panel>
  );
}

function Control({
  title,
  body,
  missing,
}: {
  title: string;
  body: string;
  missing?: boolean;
}) {
  return (
    <li className="px-5 py-3.5">
      <p className={`font-semibold ${missing ? 'text-muted-foreground' : 'text-foreground'}`}>
        {title}
      </p>
      <p className="mt-0.5 text-caption leading-relaxed text-muted-foreground">{body}</p>
    </li>
  );
}
