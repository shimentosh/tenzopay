'use client';

import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { DataTable, type Column } from '@/components/data-table';
import { Badge } from '@/components/ui/primitives';
import { formatDateTime } from '@/lib/utils';

interface AuditRow {
  id: string;
  action: string;
  actorType: string;
  entityType: string | null;
  entityId: string | null;
  reason: string | null;
  ipAddress: string | null;
  createdAt: string;
  adminUser: { email: string; name: string; role: string } | null;
}

export default function AuditPage() {
  const { data, isLoading } = useQuery({
    queryKey: ['admin-audit'],
    queryFn: () => api.get<{ data: AuditRow[] }>('/admin/audit?limit=100'),
  });

  const columns: Column<AuditRow>[] = [
    {
      key: 'action',
      header: 'Action',
      render: (row) => (
        <span className="text-sm font-medium text-foreground">
          {row.action.replace(/_/g, ' ').toLowerCase()}
        </span>
      ),
    },
    {
      key: 'actor',
      header: 'Actor',
      render: (row) => (
        <div className="min-w-0">
          <p className="truncate text-sm text-foreground">
            {row.adminUser?.email ?? row.actorType}
          </p>
          {row.adminUser ? (
            <Badge tone="brand" className="mt-0.5">
              {row.adminUser.role.replace(/_/g, ' ')}
            </Badge>
          ) : null}
        </div>
      ),
    },
    {
      key: 'entity',
      header: 'Target',
      secondary: true,
      render: (row) => (
        <span className="font-mono text-[11px] text-muted-foreground">
          {row.entityType ?? '—'}
          {row.entityId ? ` ${row.entityId.slice(0, 8)}` : ''}
        </span>
      ),
    },
    {
      key: 'reason',
      header: 'Reason',
      render: (row) => (
        <span className="line-clamp-2 max-w-sm text-xs text-muted-foreground">
          {row.reason ?? '—'}
        </span>
      ),
    },
    {
      key: 'ip',
      header: 'IP',
      secondary: true,
      render: (row) => (
        <span className="font-mono text-[11px] text-muted-foreground">
          {row.ipAddress ?? '—'}
        </span>
      ),
    },
    {
      key: 'when',
      header: 'When',
      secondary: true,
      render: (row) => (
        <span className="text-xs text-muted-foreground">{formatDateTime(row.createdAt)}</span>
      ),
    },
  ];

  return (
    <div className="mx-auto max-w-6xl">
      <DataTable
        title="Audit log"
        description="Append-only record of every privileged action."
        columns={columns}
        rows={data?.data}
        isLoading={isLoading}
        rowKey={(row) => row.id}
        emptyTitle="No audit entries"
      />
    </div>
  );
}
