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
      <ul className="divide-y">
        {rows.map((row) => {
          const incoming = !row.amount.startsWith('-');
          const magnitude = incoming ? row.amount : row.amount.slice(1);

          return (
            <li key={`${row.kind}-${row.id}`}>
              <button
                type="button"
                onClick={() => setSelected(row)}
                className="flex w-full items-center gap-3 px-5 py-3.5 text-left transition-colors hover:bg-muted/40"
              >
                <span
                  className={cn(
                    'flex size-9 shrink-0 items-center justify-center rounded-full',
                    incoming
                      ? 'bg-positive-soft text-[color-mix(in_oklch,var(--color-positive),black_15%)]'
                      : 'bg-muted text-muted-foreground',
                  )}
                  aria-hidden
                >
                  {row.kind === 'DEPOSIT' ? (
                    <Wallet className="size-4" />
                  ) : row.kind === 'CARD' ? (
                    <CreditCard className="size-4" />
                  ) : incoming ? (
                    <ArrowDownLeft className="size-4" />
                  ) : (
                    <ArrowUpRight className="size-4" />
                  )}
                </span>

                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-foreground">
                    {row.description}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {row.cardName ? `${row.cardName} · ` : ''}
                    {row.cardLastFour ? `•••• ${row.cardLastFour} · ` : ''}
                    {relativeTime(row.createdAt)}
                  </p>
                </div>

                <div className="hidden sm:block">
                  <StatusBadge status={row.status} />
                </div>

                <span
                  className={cn(
                    'tnum shrink-0 text-sm font-semibold',
                    incoming ? 'text-positive' : 'text-foreground',
                  )}
                >
                  {incoming ? '+' : '−'}
                  {money(magnitude, row.currency)}
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
