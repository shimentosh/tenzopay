'use client';

import { useInfiniteQuery } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/primitives';
import { TransactionList } from '@/components/app/transaction-list';
import type { Paginated, TransactionRow } from '@tenzopay/shared';

/**
 * Paginated transaction feed.
 *
 * Cursor-based, not offset-based: the feed is ordered by creation time and new
 * transactions arrive constantly, so an OFFSET would silently skip or repeat
 * rows as the underlying list shifts beneath the reader.
 *
 * The page size is deliberately modest — nothing here should ever try to load
 * an account's entire history into the browser.
 */
export function TransactionFeed({
  query,
  pageSize = 25,
}: {
  /** Filter params, without `limit` or `cursor`. */
  query: URLSearchParams;
  pageSize?: number;
}) {
  const key = query.toString();

  const { data, isLoading, fetchNextPage, hasNextPage, isFetchingNextPage } =
    useInfiniteQuery({
      queryKey: ['transactions', key, pageSize],
      initialPageParam: null as string | null,
      queryFn: ({ pageParam }) => {
        const params = new URLSearchParams(query);
        params.set('limit', String(pageSize));
        if (pageParam) params.set('cursor', pageParam);
        return api.get<Paginated<TransactionRow>>(`/transactions?${params}`);
      },
      getNextPageParam: (lastPage) =>
        lastPage.hasMore ? lastPage.nextCursor : undefined,
    });

  if (isLoading) {
    return (
      <div className="space-y-3 p-5">
        {[0, 1, 2, 3, 4].map((i) => (
          <Skeleton key={i} className="h-12 w-full" />
        ))}
      </div>
    );
  }

  const rows = data?.pages.flatMap((page) => page.data) ?? [];

  return (
    <>
      <TransactionList rows={rows} />

      {hasNextPage ? (
        <div className="p-4 text-center">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => void fetchNextPage()}
            loading={isFetchingNextPage}
          >
            Load more
          </Button>
        </div>
      ) : rows.length ? (
        <p className="px-5 py-6 text-center text-caption text-content-tertiary">
          {/* Confirms the list is complete, so an empty scroll is never
              mistaken for a failure to load. */}
          That&rsquo;s everything — {rows.length}{' '}
          {rows.length === 1 ? 'transaction' : 'transactions'}.
        </p>
      ) : null}
    </>
  );
}
