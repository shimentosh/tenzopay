'use client';

import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Snowflake } from 'lucide-react';
import { toast } from 'sonner';
import { api, ApiError } from '@/lib/api';
import { DataTable, StatusFilter, type Column } from '@/components/data-table';
import { StatusBadge } from '@/components/ui/primitives';
import { Button } from '@/components/ui/button';
import { formatDate, usd } from '@/lib/utils';

interface AdminCard {
  id: string;
  name: string;
  lastFour: string;
  status: string;
  userEmail: string;
  userId: string;
  providerCardToken: string;
  dailyLimit: string | null;
  monthlyLimit: string | null;
  transactionCount: number;
  lastSyncedAt: string | null;
  createdAt: string;
}

const statuses = ['', 'ACTIVE', 'FROZEN', 'CLOSED'];

export default function AdminCardsPage() {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['admin-cards', status],
    queryFn: () =>
      api.get<{ data: AdminCard[] }>(
        `/admin/cards?limit=50${status ? `&status=${status}` : ''}`,
      ),
  });

  const freeze = useMutation({
    mutationFn: (id: string) => {
      const reason = window.prompt('Reason for freezing this card (min 10 characters):');
      if (!reason || reason.trim().length < 10) {
        return Promise.reject(new Error('A reason of at least 10 characters is required.'));
      }
      return api.post(`/admin/cards/${id}/freeze`, { reason: reason.trim() });
    },
    onSuccess: () => {
      toast.success('Card frozen at the issuer.');
      void queryClient.invalidateQueries({ queryKey: ['admin-cards'] });
    },
    onError: (error) =>
      toast.error(error instanceof ApiError ? error.message : (error as Error).message),
  });

  const columns: Column<AdminCard>[] = [
    {
      key: 'card',
      header: 'Card',
      render: (row) => (
        <div className="min-w-0">
          <p className="truncate font-semibold text-foreground">
            {row.name}{' '}
            {/* Last four only — full PAN is never exposed to staff. */}
            <span className="font-normal text-muted-foreground">•••• {row.lastFour}</span>
          </p>
          <p className="truncate font-mono text-[11px] text-muted-foreground">
            {row.providerCardToken}
          </p>
        </div>
      ),
    },
    {
      key: 'holder',
      header: 'Cardholder',
      render: (row) => (
        <Link href={`/users/${row.userId}`} className="text-ui text-primary hover:underline">
          {row.userEmail}
        </Link>
      ),
    },
    { key: 'status', header: 'Status', render: (row) => <StatusBadge status={row.status} /> },
    {
      key: 'limits',
      header: 'Limits',
      secondary: true,
      numeric: true,
      render: (row) => (
        <span className="text-caption text-muted-foreground">
          {row.dailyLimit ? `${usd(row.dailyLimit)}/d` : '—'}
          {row.monthlyLimit ? ` · ${usd(row.monthlyLimit)}/m` : ''}
        </span>
      ),
    },
    {
      key: 'txns',
      header: 'Txns',
      numeric: true,
      secondary: true,
      render: (row) => row.transactionCount,
    },
    {
      key: 'sync',
      header: 'Synced',
      secondary: true,
      render: (row) => (
        <span className="text-caption text-muted-foreground">
          {row.lastSyncedAt ? formatDate(row.lastSyncedAt) : 'Never'}
        </span>
      ),
    },
    {
      key: 'actions',
      header: '',
      render: (row) =>
        row.status === 'ACTIVE' ? (
          <Button size="sm" variant="ghost" onClick={() => freeze.mutate(row.id)}>
            <Snowflake className="size-3.5" aria-hidden />
            Freeze
          </Button>
        ) : null,
    },
  ];

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <StatusFilter value={status} onChange={setStatus} options={statuses} />

      <DataTable
        title="Cards"
        description="Issued cards across all accounts."
        columns={columns}
        rows={data?.data}
        isLoading={isLoading}
        rowKey={(row) => row.id}
        emptyTitle="No cards"
      />
    </div>
  );
}
