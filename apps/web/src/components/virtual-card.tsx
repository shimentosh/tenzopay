'use client';

import { Snowflake, Wifi } from 'lucide-react';
import { cn, usd } from '@/lib/utils';
import type { CardSummary } from '@tenzopay/shared';

/**
 * The card face.
 *
 * Deliberately the heaviest object on the page: it is what the product *is*.
 * It never renders a full PAN — only the last four. The complete number is
 * shown by the issuer's own iframe (see the reveal flow), so card secrets
 * never enter this application's DOM or its servers.
 */
export function VirtualCard({
  card,
  className,
  compact,
}: {
  card: CardSummary;
  className?: string;
  compact?: boolean;
}) {
  const frozen = card.status === 'FROZEN';
  const closed = card.status === 'CLOSED';

  const limit = card.dailyLimit ?? card.monthlyLimit;
  const limitPeriod = card.dailyLimit ? 'day' : 'month';
  const spent = card.dailyLimit ? card.spentToday : card.spentThisMonth;

  const pct =
    limit && BigInt(limit) > 0n
      ? Math.min(100, Number((BigInt(spent) * 100n) / BigInt(limit)))
      : 0;

  return (
    <div
      className={cn(
        'relative isolate flex flex-col justify-between overflow-hidden rounded-2xl p-5 text-white',
        'transition-colors duration-150 ease',
        compact ? 'aspect-[1.75/1]' : 'aspect-[1.586/1]',
        frozen ? 'card-face-frozen' : closed ? 'card-face-closed' : 'card-face',
        className,
      )}
    >
      {/* Subtle engraved arc, the way a real card catches light. */}
      <div
        aria-hidden
        className="pointer-events-none absolute -right-16 -top-24 size-64 rounded-full border border-white/10"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -bottom-28 -left-20 size-72 rounded-full border border-white/[0.07]"
      />

      <div className="relative flex items-start justify-between">
        <div className="min-w-0">
          <p className="truncate text-[13px] font-semibold text-white/70">
            {card.name}
          </p>
          {limit ? (
            <p className="mt-0.5 text-[11px] text-white/45">
              {usd(limit)} / {limitPeriod}
            </p>
          ) : null}
        </div>

        {frozen ? (
          <span className="flex items-center gap-1 rounded-full bg-white/15 px-2 py-1 text-caption font-semibold">
            <Snowflake className="size-3" aria-hidden />
            Frozen
          </span>
        ) : closed ? (
          <span className="rounded-full bg-white/15 px-2 py-1 text-caption font-semibold">
            Closed
          </span>
        ) : (
          <Wifi className="size-4 rotate-90 text-white/45" aria-hidden />
        )}
      </div>

      <div className="relative">
        <p className="tnum text-[17px] tracking-[0.18em] text-white/90">
          <span aria-hidden>•••• •••• •••• </span>
          <span className="sr-only">Card ending in </span>
          {card.lastFour}
        </p>

        <div className="mt-3 flex items-end justify-between">
          <div>
            <p className="text-caption text-white/45">
              Expires
            </p>
            <p className="tnum text-xs text-white/80">
              {card.expMonth}/{card.expYear.slice(-2)}
            </p>
          </div>

          <span className="text-sm font-semibold italic tracking-tight text-white/85">
            {card.network}
          </span>
        </div>

        {limit && !closed ? (
          <div className="mt-3.5">
            <div
              className="h-1 overflow-hidden rounded-full bg-white/15"
              role="progressbar"
              aria-valuenow={pct}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label={`${pct}% of ${limitPeriod}ly limit used`}
            >
              <div
                className={cn(
                  'h-full rounded-full transition-[width] duration-500',
                  pct >= 90 ? 'bg-critical' : pct >= 70 ? 'bg-warning' : 'bg-white/70',
                )}
                style={{ width: `${Math.max(pct, 2)}%` }}
              />
            </div>
            <p className="mt-1.5 tnum text-[11px] text-white/50">
              {usd(spent)} used of {usd(limit)}
            </p>
          </div>
        ) : null}
      </div>
    </div>
  );
}
