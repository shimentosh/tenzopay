'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { CreditCard, Plus } from 'lucide-react';
import { useState } from 'react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { EmptyState, Panel, Skeleton, StatusBadge } from '@/components/ui/primitives';
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
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            Cards
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Every card spends from your single available balance.
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="size-4" aria-hidden />
          Create card
        </Button>
      </div>

      {isLoading ? (
        <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="space-y-3">
              <Skeleton className="aspect-[1.586/1] w-full rounded-2xl" />
              <Skeleton className="h-4 w-2/3" />
            </div>
          ))}
        </div>
      ) : active.length ? (
        <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {active.map((card) => (
            <CardTile key={card.id} card={card} />
          ))}
        </div>
      ) : (
        <Panel>
          <EmptyState
            icon={<CreditCard className="size-5" />}
            title="No cards yet"
            description="Create your first virtual card and give it a daily or monthly limit."
            action={
              <Button size="sm" onClick={() => setCreateOpen(true)}>
                Create card
              </Button>
            }
          />
        </Panel>
      )}

      {closed.length ? (
        <section>
          <h2 className="mb-4 text-sm font-semibold text-muted-foreground">
            Closed cards
          </h2>
          <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
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
      className="group block rounded-2xl transition-transform duration-300 hover:-translate-y-1"
    >
      <VirtualCard card={card} />
      <div className="mt-3 flex items-center justify-between gap-2 px-0.5">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-foreground">
            {card.name}
          </p>
          <p className="tnum text-xs text-muted-foreground">
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
