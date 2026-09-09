'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { ArrowLeft, Snowflake, Sun } from 'lucide-react';
import { toast } from 'sonner';
import { api, ApiError } from '@/lib/api';
import { Button } from '@/components/ui/button';
import {
  Alert,
  EmptyState,
  Field,
  Input,
  Panel,
  PanelHeader,
  Skeleton,
  StatusBadge,
} from '@/components/ui/primitives';
import { formatDateTime, money, truncateHash, usd } from '@/lib/utils';

interface UserDetail {
  user: {
    id: string;
    email: string;
    firstName: string | null;
    lastName: string | null;
    phoneNumber: string | null;
    status: string;
    kycStatus: string;
    emailVerifiedAt: string | null;
    lastLoginAt: string | null;
    createdAt: string;
  };
  balance: { currency: string; available: string; held: string; total: string };
  cards: {
    id: string;
    name: string;
    lastFour: string;
    status: string;
    dailyLimit: string | null;
    monthlyLimit: string | null;
    providerCardToken: string;
    createdAt: string;
  }[];
  deposits: {
    id: string;
    amount: string;
    status: string;
    txHash: string | null;
    createdAt: string;
  }[];
  recentTransactions: {
    id: string;
    amount: string;
    status: string;
    merchantName: string | null;
    createdAt: string;
    card: { name: string; lastFour: string } | null;
  }[];
}

export default function UserDetailPage() {
  const params = useParams<{ id: string }>();
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['admin-user', params.id],
    queryFn: () => api.get<UserDetail>(`/admin/users/${params.id}`),
  });

  const statusMutation = useMutation({
    mutationFn: (input: { status: 'FROZEN' | 'ACTIVE'; reason: string }) =>
      api.post(`/admin/users/${params.id}/status`, input),
    onSuccess: () => {
      toast.success('Account status updated.');
      void queryClient.invalidateQueries({ queryKey: ['admin-user', params.id] });
    },
    onError: (error) =>
      toast.error(
        error instanceof ApiError ? error.message : 'Could not update the account.',
      ),
  });

  if (isLoading) {
    return (
      <div className="mx-auto max-w-5xl space-y-4">
        <Skeleton className="h-6 w-32" />
        <Skeleton className="h-40 rounded-card" />
      </div>
    );
  }

  if (!data) {
    return (
      <Panel className="mx-auto max-w-lg">
        <EmptyState title="User not found" />
      </Panel>
    );
  }

  const { user, balance } = data;
  const frozen = user.status === 'FROZEN';

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <Link
        href="/users"
        className="inline-flex items-center gap-1.5 text-ui text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" aria-hidden />
        All users
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-subtitle font-semibold tracking-tight text-foreground">
            {[user.firstName, user.lastName].filter(Boolean).join(' ') || user.email}
          </h1>
          <p className="mt-1 text-ui text-muted-foreground">{user.email}</p>
          <div className="mt-2.5 flex flex-wrap gap-2">
            <StatusBadge status={user.status} />
            <StatusBadge status={user.kycStatus} />
          </div>
        </div>

        <Button
          variant={frozen ? 'secondary' : 'destructiveOutline'}
          size="sm"
          loading={statusMutation.isPending}
          onClick={() => {
            const reason = window.prompt(
              frozen
                ? 'Reason for unfreezing this account (min 10 characters):'
                : 'Reason for freezing this account (min 10 characters):',
            );
            // A reason is mandatory — the API rejects anything shorter, and the
            // audit trail is worthless without it.
            if (!reason || reason.trim().length < 10) {
              if (reason !== null) toast.error('A reason of at least 10 characters is required.');
              return;
            }
            statusMutation.mutate({
              status: frozen ? 'ACTIVE' : 'FROZEN',
              reason: reason.trim(),
            });
          }}
        >
          {frozen ? (
            <>
              <Sun className="size-4" aria-hidden />
              Unfreeze account
            </>
          ) : (
            <>
              <Snowflake className="size-4" aria-hidden />
              Freeze account
            </>
          )}
        </Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Panel className="p-5">
          <p className="text-caption text-muted-foreground">Available</p>
          <p className="tnum mt-1.5 text-subtitle font-semibold text-foreground">
            {money(balance.available)} <span className="text-ui text-muted-foreground">USDT</span>
          </p>
        </Panel>
        <Panel className="p-5">
          <p className="text-caption text-muted-foreground">Held</p>
          <p className="tnum mt-1.5 text-subtitle font-semibold text-foreground">
            {money(balance.held)} <span className="text-ui text-muted-foreground">USDT</span>
          </p>
        </Panel>
        <Panel className="p-5">
          <p className="text-caption text-muted-foreground">Total</p>
          <p className="tnum mt-1.5 text-subtitle font-semibold text-foreground">
            {money(balance.total)} <span className="text-ui text-muted-foreground">USDT</span>
          </p>
        </Panel>
      </div>

      <LedgerAdjustment userId={user.id} />

      <Panel>
        <PanelHeader title="Profile" />
        <dl className="divide-y divide-border">
          <Row label="Phone" value={user.phoneNumber ?? '—'} />
          <Row label="Email verified" value={formatDateTime(user.emailVerifiedAt)} />
          <Row label="Last sign in" value={formatDateTime(user.lastLoginAt)} />
          <Row label="Joined" value={formatDateTime(user.createdAt)} />
        </dl>
      </Panel>

      <Panel>
        <PanelHeader title={`Cards (${data.cards.length})`} />
        {data.cards.length ? (
          <ul className="divide-y divide-border">
            {data.cards.map((card) => (
              <li key={card.id} className="flex items-center justify-between gap-4 px-5 py-3.5">
                <div className="min-w-0">
                  <p className="truncate text-ui font-semibold text-foreground">
                    {card.name}{' '}
                    <span className="font-normal text-muted-foreground">•••• {card.lastFour}</span>
                  </p>
                  {/* Provider token is shown for support; the full PAN never is. */}
                  <p className="truncate font-mono text-[11px] text-muted-foreground">
                    {card.providerCardToken}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <span className="tnum hidden text-caption text-muted-foreground sm:block">
                    {card.dailyLimit ? `${usd(card.dailyLimit)}/day` : '—'}
                  </span>
                  <StatusBadge status={card.status} />
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState title="No cards" />
        )}
      </Panel>

      <Panel>
        <PanelHeader title={`Deposits (${data.deposits.length})`} />
        {data.deposits.length ? (
          <ul className="divide-y divide-border">
            {data.deposits.map((deposit) => (
              <li key={deposit.id} className="flex items-center justify-between gap-4 px-5 py-3.5">
                <div className="min-w-0">
                  <p className="tnum text-ui font-semibold text-foreground">
                    {money(deposit.amount)} USDT
                  </p>
                  <p className="truncate font-mono text-[11px] text-muted-foreground">
                    {truncateHash(deposit.txHash, 8)}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <span className="hidden text-caption text-muted-foreground sm:block">
                    {formatDateTime(deposit.createdAt)}
                  </span>
                  <StatusBadge status={deposit.status} />
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState title="No deposits" />
        )}
      </Panel>

      <Panel>
        <PanelHeader title="Recent card transactions" />
        {data.recentTransactions.length ? (
          <ul className="divide-y divide-border">
            {data.recentTransactions.map((tx) => (
              <li key={tx.id} className="flex items-center justify-between gap-4 px-5 py-3.5">
                <div className="min-w-0">
                  <p className="truncate text-ui font-semibold text-foreground">
                    {tx.merchantName ?? 'Card transaction'}
                  </p>
                  <p className="truncate text-caption text-muted-foreground">
                    {tx.card ? `${tx.card.name} •••• ${tx.card.lastFour} · ` : ''}
                    {formatDateTime(tx.createdAt)}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <span className="tnum text-ui font-semibold text-foreground">
                    {usd(tx.amount)}
                  </span>
                  <StatusBadge status={tx.status} />
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState title="No transactions" />
        )}
      </Panel>
    </div>
  );
}

/**
 * Ledger adjustment.
 *
 * Note what this is NOT: there is no field to type a new balance. An operator
 * can only post a signed delta with a written reason, which becomes two
 * balanced ledger entries plus an audit record. FINANCE and SUPER_ADMIN only —
 * the API enforces that regardless of what this form allows.
 */
function LedgerAdjustment({ userId }: { userId: string }) {
  const queryClient = useQueryClient();
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');

  const mutation = useMutation({
    mutationFn: () => api.post('/admin/ledger/adjust', { userId, amount, reason }),
    onSuccess: (result: unknown) => {
      const typed = result as { before: string; after: string };
      toast.success(
        `Adjustment posted. Balance ${money(typed.before)} → ${money(typed.after)} USDT.`,
      );
      setAmount('');
      setReason('');
      void queryClient.invalidateQueries({ queryKey: ['admin-user', userId] });
    },
    onError: (error) =>
      toast.error(
        error instanceof ApiError ? error.message : 'The adjustment was not applied.',
      ),
  });

  return (
    <Panel>
      <PanelHeader
        title="Ledger adjustment"
        description="Posts double-entry records. Balances cannot be set directly."
      />
      <div className="space-y-4 p-5">
        <Alert tone="warning">
          Every adjustment is permanent, attributed to you, and written to the
          audit log. Use a negative amount to debit.
        </Alert>

        <div className="grid gap-4 sm:grid-cols-[180px_1fr]">
          <Field label="Amount (USDT)" htmlFor="adjust-amount" hint="e.g. 25.50 or -25.50">
            <Input
              id="adjust-amount"
              inputMode="decimal"
              placeholder="0.00"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </Field>

          <Field label="Reason" htmlFor="adjust-reason" hint="At least 10 characters">
            <Input
              id="adjust-reason"
              placeholder="Goodwill credit for support ticket #1234"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </Field>
        </div>

        <div className="flex justify-end">
          <Button
            size="sm"
            loading={mutation.isPending}
            disabled={!amount || reason.trim().length < 10}
            onClick={() => {
              if (
                window.confirm(
                  `Post an adjustment of ${amount} USDT to this account? This cannot be undone.`,
                )
              ) {
                mutation.mutate();
              }
            }}
          >
            Post adjustment
          </Button>
        </div>
      </div>
    </Panel>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 px-5 py-3">
      <dt className="text-ui text-muted-foreground">{label}</dt>
      <dd className="text-ui font-semibold text-foreground">{value}</dd>
    </div>
  );
}
