'use client';

import { useState } from 'react';
import {
  ArrowDownLeft,
  ArrowUpRight,
  CreditCard,
  Receipt,
  Wallet,
} from 'lucide-react';
import { cn, money, relativeTime } from '@/lib/utils';
import { EmptyState, StatusBadge } from '@/components/ui/primitives';
import { TransactionDetailSheet } from '@/components/app/transaction-detail-sheet';
import type { TransactionRow } from '@tenzopay/shared';

/**
 * The transaction feed.
 *
 * One list that reads correctly at every width — no duplicated desktop table
 * for screen readers to stumble over. Rows open a detail sheet rather than
 * navigating away, so the feed keeps its scroll position.
 */
export function TransactionList({ rows }: { rows: TransactionRow[] }) {
  const [selected, setSelected] = useState<TransactionRow | null>(null);

  if (!rows.length) {
    return (
      <EmptyState
        icon={<Receipt className="size-5" />}
        title="No transactions yet"
        description="Card payments and deposits will appear here."
      />
    );
  }

  return (
    <>
      <ul>
        {rows.map((row) => {
          const incoming = !row.amount.startsWith('-');
          const magnitude = incoming ? row.amount : row.amount.slice(1);

          return (
            <li key={`${row.kind}-${row.id}`}>
              <button
                type="button"
                onClick={() => setSelected(row)}
                className="flex w-full items-center gap-4 rounded-card px-3 py-4 text-left outline-none transition-colors duration-150 ease hover:bg-surface-raised focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
              >
                <span
                  className="flex size-12 shrink-0 items-center justify-center rounded-full bg-surface-raised text-content-primary"
                  aria-hidden
                >
                  {row.kind === 'DEPOSIT' ? (
                    <Wallet className="size-5" />
                  ) : row.kind === 'CARD' ? (
                    <CreditCard className="size-5" />
                  ) : incoming ? (
                    <ArrowDownLeft className="size-5" />
                  ) : (
                    <ArrowUpRight className="size-5" />
                  )}
                </span>

                <div className="min-w-0 flex-1">
                  <p className="truncate text-ui font-semibold text-content-primary">
                    {row.description}
                  </p>
                  <p className="mt-0.5 truncate text-ui text-content-tertiary">
                    {row.cardName ? `${row.cardName} · ` : ''}
                    {row.cardLastFour ? `•••• ${row.cardLastFour} · ` : ''}
                    {relativeTime(row.createdAt)}
                  </p>
                </div>

                <div className="hidden sm:block">
                  <StatusBadge status={row.status} />
                </div>

                <span className="shrink-0 text-right">
                  <span
                    className={cn(
                      'tnum block text-value font-semibold',
                      incoming ? 'text-positive' : 'text-content-primary',
                    )}
                  >
                    {incoming ? '+' : '−'}
                    {money(magnitude, row.currency)}
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>

      <TransactionDetailSheet
        row={selected}
        open={!!selected}
        onOpenChange={(open) => {
          if (!open) setSelected(null);
        }}
      />
    </>
  );
}
