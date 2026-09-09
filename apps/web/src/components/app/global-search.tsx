'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowDownToLine,
  CreditCard,
  LayoutDashboard,
  Receipt,
  Search,
  Settings,
} from 'lucide-react';
import { api } from '@/lib/api';
import { money, relativeTime, usd } from '@/lib/utils';
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from '@/components/ui/command';
import type { CardSummary, Paginated, TransactionRow } from '@tenzopay/shared';

const pages = [
  { href: '/dashboard', label: 'Overview', icon: LayoutDashboard },
  { href: '/cards', label: 'Cards', icon: CreditCard },
  { href: '/deposit', label: 'Deposit USDT', icon: ArrowDownToLine },
  { href: '/transactions', label: 'Transactions', icon: Receipt },
  { href: '/settings', label: 'Settings', icon: Settings },
];

/**
 * Command palette (⌘K / Ctrl+K).
 *
 * This replaced a decorative search input that did nothing. A control that
 * looks interactive but has no behaviour is worse than no control — people
 * type into it and conclude the product is broken.
 *
 * Data is only fetched once the palette is opened, so the dashboard does not
 * pay for a search index nobody asked for.
 */
export function GlobalSearch() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'k' && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        setOpen((value) => !value);
      }
    };

    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, []);

  const { data: cards } = useQuery({
    queryKey: ['cards'],
    queryFn: () => api.get<CardSummary[]>('/cards'),
    enabled: open,
  });

  const { data: transactions } = useQuery({
    queryKey: ['transactions', 'search'],
    queryFn: () => api.get<Paginated<TransactionRow>>('/transactions?limit=50'),
    enabled: open,
  });

  // Filtering happens on the visible set. `cmdk` also scores matches, but an
  // explicit filter keeps the merchant list short enough to scan.
  const matchedTransactions = useMemo(() => {
    const rows = transactions?.data ?? [];
    if (!query.trim()) return rows.slice(0, 5);

    const needle = query.toLowerCase();
    return rows
      .filter(
        (row) =>
          row.description.toLowerCase().includes(needle) ||
          row.cardName?.toLowerCase().includes(needle) ||
          row.cardLastFour?.includes(needle),
      )
      .slice(0, 6);
  }, [transactions, query]);

  function go(href: string) {
    setOpen(false);
    setQuery('');
    router.push(href);
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="hidden h-11 w-full items-center gap-3 rounded-pill bg-surface-raised px-4 text-ui text-content-tertiary outline-none transition-colors duration-150 ease hover:bg-surface-raised-hover focus-visible:ring-2 focus-visible:ring-ring sm:flex"
      >
        <Search className="size-4 shrink-0" aria-hidden />
        <span>Search</span>
        <kbd className="ml-auto hidden rounded-md bg-surface-raised-hover px-1.5 font-mono text-caption text-content-tertiary md:inline-block">
          ⌘K
        </kbd>
      </button>

      {/* Icon-only trigger on small screens, where the bar has no room. */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Search"
        className="rounded-full p-2 text-content-secondary transition-colors duration-150 ease hover:bg-surface-raised sm:hidden"
      >
        <Search className="size-[18px]" aria-hidden />
      </button>

      <CommandDialog
        open={open}
        onOpenChange={setOpen}
        title="Search"
        description="Find a card, a transaction, or jump to a page."
      >
        <CommandInput
          placeholder="Search cards, merchants, amounts…"
          value={query}
          onValueChange={setQuery}
        />

        <CommandList>
          <CommandEmpty>No results found.</CommandEmpty>

          {cards?.length ? (
            <CommandGroup heading="Cards">
              {cards.map((card) => (
                <CommandItem
                  key={card.id}
                  value={`card ${card.name} ${card.lastFour}`}
                  onSelect={() => go(`/cards/${card.id}`)}
                >
                  <CreditCard aria-hidden />
                  <span className="flex-1 truncate">{card.name}</span>
                  <span className="text-caption text-muted-foreground">
                    •••• {card.lastFour}
                  </span>
                  {card.dailyLimit ? (
                    <CommandShortcut className="tnum">
                      {usd(card.dailyLimit)}/day
                    </CommandShortcut>
                  ) : null}
                </CommandItem>
              ))}
            </CommandGroup>
          ) : null}

          {matchedTransactions.length ? (
            <>
              <CommandSeparator />
              <CommandGroup heading="Transactions">
                {matchedTransactions.map((row) => {
                  const incoming = !row.amount.startsWith('-');
                  const magnitude = incoming ? row.amount : row.amount.slice(1);

                  return (
                    <CommandItem
                      key={`${row.kind}-${row.id}`}
                      value={`txn ${row.description} ${row.cardName ?? ''} ${row.id}`}
                      onSelect={() => go('/transactions')}
                    >
                      <Receipt aria-hidden />
                      <span className="flex-1 truncate">{row.description}</span>
                      <span className="text-caption text-muted-foreground">
                        {relativeTime(row.createdAt)}
                      </span>
                      <CommandShortcut className="tnum">
                        {incoming ? '+' : '−'}
                        {money(magnitude, row.currency)}
                      </CommandShortcut>
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            </>
          ) : null}

          <CommandSeparator />
          <CommandGroup heading="Go to">
            {pages.map((page) => (
              <CommandItem
                key={page.href}
                value={`page ${page.label}`}
                onSelect={() => go(page.href)}
              >
                <page.icon aria-hidden />
                {page.label}
              </CommandItem>
            ))}
          </CommandGroup>
        </CommandList>
      </CommandDialog>
    </>
  );
}
