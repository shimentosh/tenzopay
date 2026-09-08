'use client';

import { useQuery } from '@tanstack/react-query';
import { CheckCircle2, XCircle } from 'lucide-react';
import { api } from '@/lib/api';
import { Panel, PanelHeader, Skeleton } from '@/components/ui/primitives';
import { formatDateTime } from '@/lib/utils';

interface Health {
  database: { ok: boolean; latencyMs: number; error?: string };
  cardProvider: { name: string; ok: boolean; latencyMs: number; error?: string };
  blockchain: {
    name: string;
    network: string;
    ok: boolean;
    latencyMs: number;
    error?: string;
  };
  ledgerIntegrity: {
    ok: boolean;
    checkedTransactions: number;
    unbalanced: string[];
    negativeBalances: string[];
  };
  webhookQueue: Record<string, number>;
  checkedAt: string;
}

export default function HealthPage() {
  const { data, isLoading } = useQuery({
    queryKey: ['admin-health'],
    queryFn: () => api.get<Health>('/admin/health'),
    refetchInterval: 15_000,
  });

  if (isLoading) {
    return (
      <div className="mx-auto max-w-3xl space-y-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-20 rounded-2xl" />
        ))}
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div className="space-y-3">
        <Check
          label="Database"
          ok={data?.database.ok ?? false}
          detail={`${data?.database.latencyMs ?? 0}ms`}
          error={data?.database.error}
        />
        <Check
          label={`Card provider (${data?.cardProvider.name ?? '—'})`}
          ok={data?.cardProvider.ok ?? false}
          detail={`${data?.cardProvider.latencyMs ?? 0}ms`}
          error={data?.cardProvider.error}
        />
        <Check
          label={`Blockchain (${data?.blockchain.name ?? '—'} · ${data?.blockchain.network ?? '—'})`}
          ok={data?.blockchain.ok ?? false}
          detail={`${data?.blockchain.latencyMs ?? 0}ms`}
          error={data?.blockchain.error}
        />
        <Check
          label="Ledger integrity"
          ok={data?.ledgerIntegrity.ok ?? false}
          detail={`${data?.ledgerIntegrity.checkedTransactions ?? 0} transactions verified`}
          error={
            data && !data.ledgerIntegrity.ok
              ? `${data.ledgerIntegrity.unbalanced.length} unbalanced, ${data.ledgerIntegrity.negativeBalances.length} negative`
              : undefined
          }
        />
      </div>

      <Panel>
        <PanelHeader
          title="Webhook queue"
          description="Anything in DEAD_LETTER needs an operator."
        />
        <dl className="divide-y divide-border">
          {Object.entries(data?.webhookQueue ?? {}).length ? (
            Object.entries(data!.webhookQueue).map(([status, count]) => (
              <div key={status} className="flex items-center justify-between px-5 py-3">
                <dt className="text-sm text-muted-foreground">
                  {status.replace(/_/g, ' ').toLowerCase()}
                </dt>
                <dd
                  className={`tnum text-sm font-semibold ${
                    status === 'DEAD_LETTER' && count > 0
                      ? 'text-destructive'
                      : 'text-foreground'
                  }`}
                >
                  {count}
                </dd>
              </div>
            ))
          ) : (
            <p className="px-5 py-6 text-center text-sm text-muted-foreground">
              No webhook events recorded.
            </p>
          )}
        </dl>
      </Panel>

      <p className="text-xs text-muted-foreground">
        Last checked {formatDateTime(data?.checkedAt)}
      </p>
    </div>
  );
}

function Check({
  label,
  ok,
  detail,
  error,
}: {
  label: string;
  ok: boolean;
  detail: string;
  error?: string;
}) {
  return (
    <Panel className="flex items-center gap-3 p-4">
      {ok ? (
        <CheckCircle2 className="size-5 shrink-0 text-positive" aria-hidden />
      ) : (
        <XCircle className="size-5 shrink-0 text-destructive" aria-hidden />
      )}
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-foreground">{label}</p>
        <p className="truncate text-xs text-muted-foreground">{error ?? detail}</p>
      </div>
      <span
        className={`text-xs font-semibold ${ok ? 'text-positive' : 'text-destructive'}`}
      >
        {ok ? 'Healthy' : 'Down'}
      </span>
    </Panel>
  );
}
