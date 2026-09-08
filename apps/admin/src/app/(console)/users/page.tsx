'use client';

import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Search } from 'lucide-react';
import { api } from '@/lib/api';
import { DataTable, type Column } from '@/components/data-table';
import { Input, StatusBadge } from '@/components/ui/primitives';
import { formatDate } from '@/lib/utils';

interface AdminUserRow {
  id: string;
  email: string;
  name: string | null;
  status: string;
  kycStatus: string;
  cardCount: number;
  depositCount: number;
  createdAt: string;
}

export default function UsersPage() {
  const router = useRouter();
  const [search, setSearch] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['admin-users', search],
    queryFn: () =>
      api.get<{ data: AdminUserRow[] }>(
        `/admin/users?limit=50${search ? `&search=${encodeURIComponent(search)}` : ''}`,
      ),
  });

  const columns: Column<AdminUserRow>[] = [
    {
      key: 'user',
      header: 'User',
      render: (row) => (
        <div className="min-w-0">
          <p className="truncate font-medium text-foreground">{row.name ?? '—'}</p>
          <p className="truncate text-xs text-muted-foreground">{row.email}</p>
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Account',
      render: (row) => <StatusBadge status={row.status} />,
    },
    {
      key: 'kyc',
      header: 'KYC',
      render: (row) => <StatusBadge status={row.kycStatus} />,
    },
    {
      key: 'cards',
      header: 'Cards',
      numeric: true,
      secondary: true,
      render: (row) => row.cardCount,
    },
    {
      key: 'deposits',
      header: 'Deposits',
      numeric: true,
      secondary: true,
      render: (row) => row.depositCount,
    },
    {
      key: 'created',
      header: 'Joined',
      secondary: true,
      render: (row) => (
        <span className="text-muted-foreground">{formatDate(row.createdAt)}</span>
      ),
    },
  ];

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <div className="relative max-w-sm">
        <Search
          className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden
        />
        <Input
          className="pl-9"
          placeholder="Search by name or email"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          aria-label="Search users"
        />
      </div>

      <DataTable
        title="Users"
        description="Select a user to see their full account."
        columns={columns}
        rows={data?.data}
        isLoading={isLoading}
        rowKey={(row) => row.id}
        onRowClick={(row) => router.push(`/users/${row.id}`)}
        emptyTitle="No users found"
        emptyDescription={search ? 'Try a different search term.' : undefined}
      />
    </div>
  );
}
