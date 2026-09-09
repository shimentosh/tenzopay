'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { RotateCcw } from 'lucide-react';
import { toast } from 'sonner';
import { api, ApiError } from '@/lib/api';
import { DataTable, StatusFilter, type Column } from '@/components/data-table';
import { StatusBadge } from '@/components/ui/primitives';
import { Button } from '@/components/ui/button';
import { formatDateTime } from '@/lib/utils';

interface WebhookRow {
  id: string;
  provider: string;
  eventId: string;
  eventType: string;
  status: string;
  retryCount: number;
  error: string | null;
  receivedAt: string;
  processedAt: string | null;
}

const statuses = ['', 'RECEIVED', 'PROCESSED', 'FAILED', 'DEAD_LETTER'];

export default function WebhooksPage() {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['admin-webhooks', status],
    queryFn: () =>
      api.get<WebhookRow[]>(
        `/admin/webhooks?limit=100${status ? `&status=${status}` : ''}`,
      ),
    refetchInterval: 20_000,
  });

  const replay = useMutation({
    mutationFn: (id: string) => {
      const reason = window.prompt('Reason for replaying this event (min 10 characters):');
      if (!reason || reason.trim().length < 10) {
        return Promise.reject(new Error('A reason of at least 10 characters is required.'));
      }
      return api.post(`/admin/webhooks/${id}/replay`, { reason: reason.trim() });
    },
    onSuccess: () => {
      // Replaying is safe: processing is idempotent on (provider, eventId).
      toast.success('Event replayed.');
      void queryClient.invalidateQueries({ queryKey: ['admin-webhooks'] });
    },
    onError: (error) =>
      toast.error(error instanceof ApiError ? error.message : (error as Error).message),
  });

  const columns: Column<WebhookRow>[] = [
    {
      key: 'event',
      header: 'Event',
      render: (row) => (
        <div className="min-w-0">
          <p className="truncate text-ui font-semibold text-foreground">{row.eventType}</p>
          <p className="truncate font-mono text-[11px] text-muted-foreground">{row.eventId}</p>
        </div>
      ),
    },
    {
      key: 'provider',
      header: 'Provider',
      render: (row) => (
        <span className="text-caption font-semibold text-muted-foreground">{row.provider}</span>
      ),
    },
    { key: 'status', header: 'Status', render: (row) => <StatusBadge status={row.status} /> },
    {
      key: 'retries',
      header: 'Retries',
      numeric: true,
      secondary: true,
      render: (row) => row.retryCount,
    },
    {
      key: 'error',
      header: 'Error',
      secondary: true,
      render: (row) =>
        row.error ? (
          <span className="line-clamp-1 max-w-xs text-caption text-destructive" title={row.error}>
            {row.error}
          </span>
        ) : (
          <span className="text-muted-foreground/60">—</span>
        ),
    },
    {
      key: 'received',
      header: 'Received',
      secondary: true,
      render: (row) => (
        <span className="text-caption text-muted-foreground">{formatDateTime(row.receivedAt)}</span>
      ),
    },
    {
      key: 'actions',
      header: '',
      render: (row) =>
        row.status === 'FAILED' || row.status === 'DEAD_LETTER' ? (
          <Button size="sm" variant="ghost" onClick={() => replay.mutate(row.id)}>
            <RotateCcw className="size-3.5" aria-hidden />
            Replay
          </Button>
        ) : null,
    },
  ];

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <StatusFilter value={status} onChange={setStatus} options={statuses} />

      <DataTable
        title="Webhook events"
        description="Processing is idempotent, so replaying an event cannot double-apply it."
        columns={columns}
        rows={data}
        isLoading={isLoading}
        rowKey={(row) => row.id}
        emptyTitle="No webhook events"
      />
    </div>
  );
}
