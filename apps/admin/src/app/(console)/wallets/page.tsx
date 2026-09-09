'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { DataTable, type Column } from '@/components/data-table';
import { Alert, Panel, PanelHeader, Skeleton } from '@/components/ui/primitives';
import { money } from '@/lib/utils';

interface LedgerTx {
  id: string;
  type: string;
  entries: {
    direction: 'DEBIT' | 'CREDIT';
    amount: string;
    currency: string;
    accountKind: string;
    userId: string | null;
  }[];
}

interface UserRow {
  id: string;
  email: string;
  name: string | null;
  status: string;
}

interface WalletRow {
  userId: string;
  email: string;
  name: string | null;
  available: bigint;
  held: bigint;
}

/**
 * Wallet balances across the platform.
 *
 * Balances are derived here the same way they are everywhere else — by summing
 * ledger entries — rather than read from a stored total. If this page ever
 * disagreed with the customer's own dashboard, one of them would be lying.
 */
export default function WalletsPage() {
  const { data: users, isLoading: usersLoading } = useQuery({
    queryKey: ['admin-users-wallets'],
    queryFn: () => api.get<{ data: UserRow[] }>('/admin/users?limit=100'),
  });

  const { data: ledger, isLoading: ledgerLoading } = useQuery({
    queryKey: ['admin-ledger-wallets'],
    queryFn: () => api.get<{ data: LedgerTx[] }>('/admin/ledger?limit=500'),
  });

  const isLoading = usersLoading || ledgerLoading;

  const balances = new Map<string, { available: bigint; held: bigint }>();
  for (const transaction of ledger?.data ?? []) {
    for (const entry of transaction.entries) {
      if (!entry.userId) continue;
      if (entry.accountKind !== 'USER_AVAILABLE' && entry.accountKind !== 'USER_HELD') {
        continue;
      }

      const current = balances.get(entry.userId) ?? { available: 0n, held: 0n };
      const signed =
        entry.direction === 'CREDIT' ? BigInt(entry.amount) : -BigInt(entry.amount);

      if (entry.accountKind === 'USER_AVAILABLE') current.available += signed;
      else current.held += signed;

      balances.set(entry.userId, current);
    }
  }

  const rows: WalletRow[] = (users?.data ?? [])
    .map((user) => {
      const balance = balances.get(user.id) ?? { available: 0n, held: 0n };
      return {
        userId: user.id,
        email: user.email,
        name: user.name,
        available: balance.available,
        held: balance.held,
      };
    })
    .sort((a, b) => (b.available + b.held > a.available + a.held ? 1 : -1));

  const totals = rows.reduce(
    (acc, row) => ({
      available: acc.available + row.available,
      held: acc.held + row.held,
    }),
    { available: 0n, held: 0n },
  );

  const columns: Column<WalletRow>[] = [
    {
      key: 'user',
      header: 'Customer',
      render: (row) => (
        <Link href={`/users/${row.userId}`} className="min-w-0 block">
          <p className="truncate font-semibold text-foreground">{row.name ?? '—'}</p>
          <p className="truncate text-caption text-primary">{row.email}</p>
        </Link>
      ),
    },
    {
      key: 'available',
      header: 'Available',
      numeric: true,
      render: (row) => (
        <span className="font-semibold text-foreground">
          {money(row.available)} USDT
        </span>
      ),
    },
    {
      key: 'held',
      header: 'Held',
      numeric: true,
      render: (row) => (
        <span className={row.held > 0n ? 'text-warning' : 'text-muted-foreground'}>
          {money(row.held)}
        </span>
      ),
    },
    {
      key: 'total',
      header: 'Total',
      numeric: true,
      secondary: true,
      render: (row) => (
        <span className="text-muted-foreground">
          {money(row.available + row.held)}
        </span>
      ),
    },
  ];

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <Alert tone="brand">
        Balances are computed from ledger entries, not stored totals. There is no
        way to edit one here — corrections go through a signed adjustment on the
        customer&rsquo;s page.
      </Alert>

      <div className="grid gap-4 sm:grid-cols-3">
        <Total label="Customer available" value={totals.available} loading={isLoading} />
        <Total label="Held by authorizations" value={totals.held} loading={isLoading} />
        <Total
          label="Total customer funds"
          value={totals.available + totals.held}
          loading={isLoading}
        />
      </div>

      <DataTable
        title="Wallets"
        description="Every customer balance, derived from the ledger."
        columns={columns}
        rows={rows}
        isLoading={isLoading}
        rowKey={(row) => row.userId}
        emptyTitle="No wallets"
      />
    </div>
  );
}

function Total({
  label,
  value,
  loading,
}: {
  label: string;
  value: bigint;
  loading: boolean;
}) {
  return (
    <Panel className="p-5">
      <p className="text-caption text-muted-foreground">{label}</p>
      {loading ? (
        <Skeleton className="mt-2 h-7 w-28" />
      ) : (
        <p className="tnum mt-1.5 text-title font-semibold text-foreground">
          {money(value)}
          <span className="ml-1.5 text-ui font-semibold text-muted-foreground">USDT</span>
        </p>
      )}
    </Panel>
  );
}
