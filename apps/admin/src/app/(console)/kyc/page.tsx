'use client';

import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { api } from '@/lib/api';
import { DataTable, type Column } from '@/components/data-table';
import { Alert, StatusBadge } from '@/components/ui/primitives';
import { cn, formatDate } from '@/lib/utils';

interface UserRow {
  id: string;
  email: string;
  name: string | null;
  status: string;
  kycStatus: string;
  createdAt: string;
}

const filters = [
  { value: '', label: 'All' },
  { value: 'PENDING_REVIEW', label: 'Pending review' },
  { value: 'PENDING_DOCUMENT', label: 'Documents needed' },
  { value: 'ACCEPTED', label: 'Accepted' },
  { value: 'REJECTED', label: 'Rejected' },
  { value: 'NOT_STARTED', label: 'Not started' },
];

export default function KycPage() {
  const router = useRouter();
  const [kycFilter, setKycFilter] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['admin-users-kyc'],
    queryFn: () => api.get<{ data: UserRow[] }>('/admin/users?limit=100'),
  });

  // Filtered client-side: the users endpoint filters on account status, not
  // KYC status, and the volume here is small.
  const rows = kycFilter
    ? data?.data.filter((row) => row.kycStatus === kycFilter)
    : data?.data;

  const columns: Column<UserRow>[] = [
    {
      key: 'user',
      header: 'Applicant',
      render: (row) => (
        <div className="min-w-0">
          <p className="truncate font-medium text-foreground">{row.name ?? '—'}</p>
          <p className="truncate text-xs text-muted-foreground">{row.email}</p>
        </div>
      ),
    },
    { key: 'kyc', header: 'KYC status', render: (row) => <StatusBadge status={row.kycStatus} /> },
    { key: 'account', header: 'Account', secondary: true, render: (row) => <StatusBadge status={row.status} /> },
    {
      key: 'joined',
      header: 'Applied',
      secondary: true,
      render: (row) => <span className="text-muted-foreground">{formatDate(row.createdAt)}</span>,
    },
  ];

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <Alert tone="brand" title="Verification is performed by the card issuer">
        Decisions come from the issuer&rsquo;s KYC workflow and arrive by webhook.
        This console shows outcomes; it does not override them.
      </Alert>

      <div
        role="tablist"
        aria-label="Filter by verification status"
        className="flex flex-wrap gap-1 rounded-lg border bg-card p-1"
      >
        {filters.map((filter) => (
          <button
            key={filter.value || 'all'}
            type="button"
            role="tab"
            aria-selected={kycFilter === filter.value}
            onClick={() => setKycFilter(filter.value)}
            className={cn(
              'rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
              kycFilter === filter.value
                ? 'bg-foreground text-background'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {filter.label}
          </button>
        ))}
      </div>

      <DataTable
        title="Identity verification"
        columns={columns}
        rows={rows}
        isLoading={isLoading}
        rowKey={(row) => row.id}
        onRowClick={(row) => router.push(`/users/${row.id}`)}
        emptyTitle="No applicants in this state"
      />
    </div>
  );
}
