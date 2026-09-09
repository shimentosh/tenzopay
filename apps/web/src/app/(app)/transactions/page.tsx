'use client';

import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { api } from '@/lib/api';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { TransactionFeed } from '@/components/app/transaction-feed';
import type { CardSummary } from '@tenzopay/shared';

const filters = [
  { value: 'all', label: 'All' },
  { value: 'deposits', label: 'Deposits' },
  { value: 'card', label: 'Card payments' },
  { value: 'refunds', label: 'Refunds' },
  { value: 'fees', label: 'Fees' },
] as const;

type FilterValue = (typeof filters)[number]['value'];

/** Sentinel: Radix Select cannot hold an empty-string item value. */
const ALL_CARDS = '__all__';

export default function TransactionsPage() {
  const [type, setType] = useState<FilterValue>('all');
  const [cardId, setCardId] = useState<string>(ALL_CARDS);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  const { data: cards } = useQuery({
    queryKey: ['cards'],
    queryFn: () => api.get<CardSummary[]>('/cards'),
  });

  const query = new URLSearchParams({ type });
  if (cardId !== ALL_CARDS) query.set('cardId', cardId);
  if (from) query.set('from', new Date(from).toISOString());
  if (to) query.set('to', new Date(`${to}T23:59:59`).toISOString());


  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-title font-semibold text-content-primary">Transactions</h1>
        <p className="mt-2 text-ui text-content-tertiary">
          Deposits, card payments, refunds and fees in one feed.
        </p>
      </div>

      <div className="space-y-4 rounded-card bg-surface-raised p-5">
          <Tabs value={type} onValueChange={(v) => setType(v as FilterValue)}>
            <TabsList>
              {filters.map((filter) => (
                <TabsTrigger key={filter.value} value={filter.value}>
                  {filter.label}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>

          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-2">
              <Label htmlFor="card-filter" className="text-caption text-content-tertiary">
                Card
              </Label>
              <Select value={cardId} onValueChange={setCardId}>
                <SelectTrigger id="card-filter" className="w-50">
                  <SelectValue placeholder="All cards" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL_CARDS}>All cards</SelectItem>
                  {cards?.map((card) => (
                    <SelectItem key={card.id} value={card.id}>
                      {card.name} ···{card.lastFour}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="from" className="text-caption text-content-tertiary">
                From
              </Label>
              <Input
                id="from"
                type="date"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
                className="w-40"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="to" className="text-caption text-content-tertiary">
                To
              </Label>
              <Input
                id="to"
                type="date"
                value={to}
                onChange={(e) => setTo(e.target.value)}
                className="w-40"
              />
            </div>
          </div>
      </div>

      <TransactionFeed query={query} />
    </div>
  );
}
