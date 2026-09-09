'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { DataTable, type Column } from '@/components/data-table';
import { StatusBadge } from '@/components/ui/primitives';
import { formatDateTime, usd } from '@/lib/utils';

interface AdminCard {
  id: string;
  name: string;
  lastFour: string;
  userEmail: string;
  userId: string;
  transactionCount: number;
  status: string;
  createdAt: string;
}

/**
 * Card transactions are reached through the cardholder, which is how support
 * actually works: a question is about a person, not an isolated payment.
 */
export default function AdminTransactionsPage() {
  const { data, isLoading } = useQuery({
    queryKey: ['admin-cards-tx'],
    queryFn: () => api.get<{ data: AdminCard[] }>('/admin/cards?limit=100'),
  });

  const rows = data?.data.filter((card) => card.transactionCount > 0);

  const columns: Column<AdminCard>[] = [
    {
      key: 'card',
      header: 'Card',
      render: (row) => (
        <p className="font-semibold text-foreground">
          {row.name} <span className="font-normal text-muted-foreground">•••• {row.lastFour}</span>
        </p>
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
    {
      key: 'count',
      header: 'Transactions',
      numeric: true,
      render: (row) => row.transactionCount,
    },
    { key: 'status', header: 'Card status', secondary: true, render: (row) => <StatusBadge status={row.status} /> },
    {
      key: 'created',
      header: 'Issued',
      secondary: true,
      render: (row) => <span className="text-muted-foreground">{formatDateTime(row.createdAt)}</span>,
    },
  ];

  return (
    <div className="mx-auto max-w-6xl">
      <DataTable
        title="Transaction activity"
        description="Open a cardholder to see their full transaction history."
        columns={columns}
        rows={rows}
        isLoading={isLoading}
        rowKey={(row) => row.id}
        emptyTitle="No card activity yet"
      />
    </div>
  );
}
