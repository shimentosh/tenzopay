'use client';

import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { api, ApiError } from '@/lib/api';
import { DataTable, StatusFilter, type Column } from '@/components/data-table';
import { Badge, StatusBadge } from '@/components/ui/primitives';
import { Button } from '@/components/ui/button';
import { formatDateTime, money, truncateHash } from '@/lib/utils';
import { cn } from '@/lib/utils';

interface AdminDeposit {
  id: string;
  userEmail: string;
  userId: string;
  amount: string;
  currency: string;
  network: string;
  address: string | null;
  txHash: string | null;
  confirmations: number;
  requiredConfirmations: number;
  status: string;
  source: string;
  credited: boolean;
  createdAt: string;
  confirmedAt: string | null;
}

const statuses = ['', 'PENDING', 'DETECTED', 'CONFIRMING', 'CONFIRMED', 'FAILED', 'ORPHANED'];

export default function DepositsPage() {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['admin-deposits', status],
    queryFn: () =>
      api.get<{ data: AdminDeposit[] }>(
        `/admin/deposits?limit=50${status ? `&status=${status}` : ''}`,
      ),
    refetchInterval: 15_000,
  });

  const reconcile = useMutation({
    mutationFn: (id: string) => {
      const reason = window.prompt('Reason for re-running reconciliation (min 10 characters):');
      if (!reason || reason.trim().length < 10) {
        return Promise.reject(new Error('A reason of at least 10 characters is required.'));
      }
      return api.post(`/admin/deposits/${id}/reconcile`, { reason: reason.trim() });
    },
    onSuccess: () => {
      toast.success('Reconciliation re-run against the chain.');
      void queryClient.invalidateQueries({ queryKey: ['admin-deposits'] });
    },
    onError: (error) =>
      toast.error(
        error instanceof ApiError ? error.message : (error as Error).message,
      ),
  });

  const columns: Column<AdminDeposit>[] = [
    {
      key: 'user',
      header: 'User',
      render: (row) => (
        <Link
          href={`/users/${row.userId}`}
          className="text-ui text-primary hover:underline"
        >
          {row.userEmail}
        </Link>
      ),
    },
    {
      key: 'amount',
      header: 'Amount',
      numeric: true,
      render: (row) => (
        <span className="font-semibold text-foreground">
          {money(row.amount)} {row.currency}
          {row.source === 'DEMO' ? (
            <Badge className="ml-2">Demo</Badge>
          ) : null}
        </span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (row) => <StatusBadge status={row.status} />,
    },
    {
      key: 'confirmations',
      header: 'Confirmations',
      numeric: true,
      secondary: true,
      render: (row) =>
        row.status === 'CONFIRMED'
          ? 'Complete'
          : `${row.confirmations} / ${row.requiredConfirmations}`,
    },
    {
      key: 'credited',
      header: 'Credited',
      render: (row) => (
        // The distinction that matters: a deposit can be CONFIRMED on chain
        // yet not yet posted to the ledger.
        <span
          className={cn(
            'text-caption font-semibold',
            row.credited ? 'text-positive' : 'text-muted-foreground',
          )}
        >
          {row.credited ? 'Posted' : 'Not posted'}
        </span>
      ),
    },
    {
      key: 'tx',
      header: 'Transaction',
      secondary: true,
      render: (row) => (
        <span className="font-mono text-[11px] text-muted-foreground">
          {truncateHash(row.txHash, 6)}
        </span>
      ),
    },
    {
      key: 'created',
      header: 'Created',
      secondary: true,
      render: (row) => (
        <span className="text-muted-foreground">{formatDateTime(row.createdAt)}</span>
      ),
    },
    {
      key: 'actions',
      header: '',
      render: (row) => (
        <Button
          size="sm"
          variant="ghost"
          disabled={reconcile.isPending}
          onClick={() => reconcile.mutate(row.id)}
        >
          <RefreshCw className="size-3.5" aria-hidden />
          Retry
        </Button>
      ),
    },
  ];

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <StatusFilter value={status} onChange={setStatus} options={statuses} />

      <DataTable
        title="Deposits"
        description="Manual crediting is not available. Reconciliation re-reads the chain."
        columns={columns}
        rows={data?.data}
        isLoading={isLoading}
        rowKey={(row) => row.id}
        emptyTitle="No deposits"
      />
    </div>
  );
}
