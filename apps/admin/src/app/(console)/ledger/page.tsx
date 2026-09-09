'use client';

import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Panel, PanelHeader, EmptyState, Skeleton, Badge } from '@/components/ui/primitives';
import { formatDateTime, money } from '@/lib/utils';

interface LedgerTx {
  id: string;
  type: string;
  description: string | null;
  idempotencyKey: string;
  createdAt: string;
  entries: {
    direction: 'DEBIT' | 'CREDIT';
    amount: string;
    currency: string;
    accountKind: string;
    userId: string | null;
  }[];
}

/**
 * The ledger, shown as it is actually stored: balanced groups of immutable
 * entries. Every row here should net to zero — that is the invariant the whole
 * system rests on, so it is displayed rather than hidden behind a summary.
 */
export default function LedgerPage() {
  const { data, isLoading } = useQuery({
    queryKey: ['admin-ledger'],
    queryFn: () => api.get<{ data: LedgerTx[] }>('/admin/ledger?limit=50'),
  });

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <Panel>
        <PanelHeader
          title="Ledger"
          description="Immutable double-entry records. Each transaction must net to zero."
        />

        {isLoading ? (
          <div className="space-y-2 p-5">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-20 w-full" />
            ))}
          </div>
        ) : data?.data.length ? (
          <ul className="divide-y divide-border">
            {data.data.map((tx) => {
              const net = tx.entries.reduce(
                (total, entry) =>
                  total +
                  (entry.direction === 'CREDIT'
                    ? BigInt(entry.amount)
                    : -BigInt(entry.amount)),
                0n,
              );

              return (
                <li key={tx.id} className="px-5 py-4">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-ui font-semibold text-foreground">
                        {tx.description ?? tx.type.replace(/_/g, ' ').toLowerCase()}
                      </p>
                      <p className="truncate font-mono text-[11px] text-muted-foreground">
                        {tx.idempotencyKey}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge tone={net === 0n ? 'positive' : 'critical'}>
                        {net === 0n ? 'Balanced' : `Net ${net.toString()}`}
                      </Badge>
                      <span className="text-caption text-muted-foreground">
                        {formatDateTime(tx.createdAt)}
                      </span>
                    </div>
                  </div>

                  <table className="mt-3 w-full text-caption">
                    <tbody>
                      {tx.entries.map((entry, index) => (
                        <tr key={index} className="text-muted-foreground">
                          <td className="w-16 py-1">
                            <span
                              className={
                                entry.direction === 'CREDIT'
                                  ? 'font-semibold text-positive'
                                  : 'font-semibold text-foreground/80'
                              }
                            >
                              {entry.direction === 'CREDIT' ? 'CR' : 'DR'}
                            </span>
                          </td>
                          <td className="py-1">
                            {entry.accountKind.replace(/_/g, ' ').toLowerCase()}
                            {entry.userId ? (
                              <span className="ml-1.5 font-mono text-[10px] text-muted-foreground">
                                {entry.userId.slice(0, 8)}
                              </span>
                            ) : null}
                          </td>
                          <td className="tnum py-1 text-right font-semibold text-foreground">
                            {money(entry.amount, entry.currency)} {entry.currency}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </li>
              );
            })}
          </ul>
        ) : (
          <EmptyState title="No ledger activity" />
        )}
      </Panel>
    </div>
  );
}
