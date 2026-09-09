import { clsx, type ClassValue } from 'clsx';
import { extendTailwindMerge } from 'tailwind-merge';
import { formatAmount } from '@tenzopay/shared';

/**
 * tailwind-merge only recognises a `text-*` utility as a FONT SIZE when the
 * value looks like one (`text-lg`, `text-[13px]`). Our scale is named
 * (h1, body-lg, micro, display, value …), so `text-body-lg` was filed as a text
 * COLOUR — putting it in the same conflict group as `text-forest`, where the
 * later class silently evicted the earlier one.
 *
 * That is not theoretical: it stripped `text-forest` off every `size="lg"`
 * button, which is why the hero CTAs rendered with unreadable labels. It cuts
 * the other way too — `cn('text-value', 'text-muted-foreground')` dropped the
 * size. Registering the scale keeps size and colour in separate groups.
 */
const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      'font-size': [{ text: ['h1', 'h2', 'h3', 'body-lg', 'body-base', 'micro', 'display', 'title', 'subtitle', 'value', 'ui', 'caption'] }],
    },
  },
});

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

/**
 * Format minor units for display.
 *
 * Money always arrives from the API as a decimal STRING of minor units, never
 * a JSON number — above 2^53 a number would quietly lose precision. Nothing in
 * the UI should ever call parseFloat on a balance.
 */
export function money(
  minorUnits: string | bigint,
  currency = 'USDT',
  opts?: { maxFractionDigits?: number },
): string {
  try {
    return formatAmount(minorUnits, currency, opts);
  } catch {
    return '—';
  }
}

/** USD cents, as card limits and spend are denominated. */
export function usd(cents: string | bigint | null | undefined): string {
  if (cents === null || cents === undefined) return '—';
  try {
    return `$${formatAmount(cents, 'USD')}`;
  } catch {
    return '—';
  }
}

export function signedMoney(minorUnits: string, currency = 'USDT'): string {
  const negative = minorUnits.startsWith('-');
  const formatted = money(negative ? minorUnits.slice(1) : minorUnits, currency);
  return `${negative ? '−' : '+'}${formatted}`;
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function relativeTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const diff = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diff / 60_000);

  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;

  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;

  return formatDate(iso);
}

export function truncateHash(hash: string | null | undefined, size = 6): string {
  if (!hash) return '—';
  if (hash.length <= size * 2 + 3) return hash;
  return `${hash.slice(0, size + 2)}…${hash.slice(-size)}`;
}

export function initials(first?: string | null, last?: string | null): string {
  return `${first?.[0] ?? ''}${last?.[0] ?? ''}`.toUpperCase() || 'U';
}
