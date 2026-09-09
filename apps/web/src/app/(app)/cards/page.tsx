'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { CreditCard, Plus } from 'lucide-react';
import { useState } from 'react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { EmptyState, Skeleton, StatusBadge } from '@/components/ui/primitives';
import { SectionHeader } from '@/components/ui/patterns';
import { VirtualCard } from '@/components/virtual-card';
import { CreateCardDialog } from '@/components/app/create-card-dialog';
import { usd } from '@/lib/utils';
import type { CardSummary } from '@tenzopay/shared';

export default function CardsPage() {
  const [createOpen, setCreateOpen] = useState(false);

  const { data: cards, isLoading } = useQuery({
    queryKey: ['cards'],
    queryFn: () => api.get<CardSummary[]>('/cards'),
  });

  const active = cards?.filter((c) => c.status !== 'CLOSED') ?? [];
  const closed = cards?.filter((c) => c.status === 'CLOSED') ?? [];

  return (
    <div className="space-y-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-title font-semibold text-content-primary">Cards</h1>
          <p className="mt-2 text-ui text-content-tertiary">
            Every card spends from your single available balance.
          </p>
        </div>
        {/* The one accent-filled action on this screen. */}
        <Button onClick={() => setCreateOpen(true)}>
          <Plus aria-hidden />
          Create card
        </Button>
      </div>

      {isLoading ? (
        <div className="grid gap-6 sm:grid-cols-2">
          {[0, 1].map((i) => (
            <div key={i} className="space-y-3">
              <Skeleton className="aspect-[1.586/1] w-full" />
              <Skeleton className="h-4 w-2/3" />
            </div>
          ))}
        </div>
      ) : active.length ? (
        <div className="grid gap-6 sm:grid-cols-2">
          {active.map((card) => (
            <CardTile key={card.id} card={card} />
          ))}
        </div>
      ) : (
        <div className="rounded-card bg-surface-raised">
          <EmptyState
            icon={<CreditCard className="size-5" />}
            title="No cards yet"
            description="Create your first virtual card and give it a daily or monthly limit."
            action={
              <Button variant="secondary" onClick={() => setCreateOpen(true)}>
                Create card
              </Button>
            }
          />
        </div>
      )}

      {closed.length ? (
        <section aria-labelledby="closed-cards" className="space-y-4">
          <div id="closed-cards">
            <SectionHeader title="Closed cards" />
          </div>
          <div className="grid gap-6 sm:grid-cols-2">
            {closed.map((card) => (
              <CardTile key={card.id} card={card} />
            ))}
          </div>
        </section>
      ) : null}

      <CreateCardDialog open={createOpen} onOpenChange={setCreateOpen} />
    </div>
  );
}

function CardTile({ card }: { card: CardSummary }) {
  return (
    <Link
      href={`/cards/${card.id}`}
      className="block rounded-card outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
    >
      <VirtualCard card={card} />
      <div className="mt-3 flex items-center justify-between gap-3 px-0.5">
        <div className="min-w-0">
          <p className="truncate text-ui font-semibold text-content-primary">{card.name}</p>
          <p className="tnum mt-0.5 text-ui text-content-tertiary">
            {card.dailyLimit
              ? `${usd(card.dailyLimit)} / day`
              : card.monthlyLimit
                ? `${usd(card.monthlyLimit)} / month`
                : 'No limit set'}
          </p>
        </div>
        <StatusBadge status={card.status} />
      </div>
    </Link>
  );
}
