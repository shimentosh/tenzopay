'use client';

import { useQuery } from '@tanstack/react-query';
import { CheckCircle2, Clock, XCircle } from 'lucide-react';
import { api } from '@/lib/api';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Separator } from '@/components/ui/separator';
import { Skeleton, StatusBadge } from '@/components/ui/primitives';
import { formatDateTime, money, usd } from '@/lib/utils';
import type { TransactionRow } from '@tenzopay/shared';

interface CardTransactionDetail {
  id: string;
  providerTransactionToken: string;
  status: string;
  amount: string;
  settledAmount: string | null;
  currency: string;
  merchantName: string | null;
  mcc: string | null;
  merchantCountry: string | null;
  networkResult: string | null;
  declineReason: string | null;
  authorizedAt: string | null;
  settledAt: string | null;
  createdAt: string;
  card: { name: string; lastFour: string } | null;
  authorizations: {
    decision: string;
    reason: string | null;
    amount: string;
    createdAt: string;
    latencyMs: number | null;
  }[];
}

/**
 * Transaction detail.
 *
 * The authorization timeline is the part worth showing: it explains *why* a
 * payment was approved or declined, which is the question support and
 * cardholders actually have. A card row without it is just a number.
 */
export function TransactionDetailSheet({
  row,
  open,
  onOpenChange,
}: {
  row: TransactionRow | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const isCard = row?.kind === 'CARD';

  const { data, isLoading } = useQuery({
    queryKey: ['transaction', row?.id],
    queryFn: () => api.get<CardTransactionDetail>(`/transactions/${row!.id}`),
    enabled: open && isCard && !!row?.id,
  });

  if (!row) return null;

  const incoming = !row.amount.startsWith('-');
  const magnitude = incoming ? row.amount : row.amount.slice(1);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-md">
        <SheetHeader>
          <SheetTitle>{row.description}</SheetTitle>
          <SheetDescription>
            {row.kind === 'CARD'
              ? 'Card payment'
              : row.kind === 'DEPOSIT'
                ? 'USDT deposit'
                : row.kind === 'FEE'
                  ? 'Fee'
                  : 'Adjustment'}
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-6 px-4 pb-6">
          <div>
            <p
              className={`tnum text-display font-semibold ${
                incoming ? 'text-positive' : 'text-foreground'
              }`}
            >
              {incoming ? '+' : '−'}
              {money(magnitude, row.currency)}
              <span className="ml-1.5 text-value font-semibold text-muted-foreground">
                {row.currency}
              </span>
            </p>
            <div className="mt-2">
              <StatusBadge status={row.status} />
            </div>
          </div>

          <Separator />

          <dl className="space-y-3">
            <Row label="Merchant" value={row.description} />
            {row.cardName ? (
              <Row
                label="Card"
                value={`${row.cardName} •••• ${row.cardLastFour ?? '••••'}`}
              />
            ) : null}
            <Row label="Currency" value={row.currency} />
            <Row label="Created" value={formatDateTime(row.createdAt)} />
            {row.settledAt ? (
              <Row label="Settled" value={formatDateTime(row.settledAt)} />
            ) : null}

            {isLoading && isCard ? (
              <Skeleton className="h-16 w-full" />
            ) : data ? (
              <>
                {data.mcc ? <Row label="Category code" value={data.mcc} /> : null}
                {data.merchantCountry ? (
                  <Row label="Country" value={data.merchantCountry} />
                ) : null}
                <Row label="Authorized" value={formatDateTime(data.authorizedAt)} />
                <Row
                  label="Authorized amount"
                  value={usd(data.amount)}
                  mono
                />
                {data.settledAmount ? (
                  <Row label="Settled amount" value={usd(data.settledAmount)} mono />
                ) : null}
                {data.networkResult ? (
                  <Row label="Network result" value={data.networkResult} />
                ) : null}
              </>
            ) : null}

            {row.reference ? (
              <Row label="Reference" value={row.reference} mono wrap />
            ) : null}
            <Row label="Transaction ID" value={row.id} mono wrap />
          </dl>

          {data?.authorizations.length ? (
            <>
              <Separator />
              <div>
                <p className="mb-3 text-caption text-content-tertiary">
                  Authorization timeline
                </p>
                <ol className="space-y-3">
                  {data.authorizations.map((auth, index) => {
                    const approved = auth.decision === 'APPROVED';
                    return (
                      <li key={index} className="flex gap-3">
                        {approved ? (
                          <CheckCircle2
                            className="mt-0.5 size-4 shrink-0 text-positive"
                            aria-hidden
                          />
                        ) : (
                          <XCircle
                            className="mt-0.5 size-4 shrink-0 text-destructive"
                            aria-hidden
                          />
                        )}
                        <div className="min-w-0 flex-1">
                          <p className="text-ui font-semibold text-foreground">
                            {auth.decision.replace(/_/g, ' ').toLowerCase()}
                          </p>
                          <p className="text-caption text-muted-foreground">
                            {usd(auth.amount)}
                            {auth.reason ? ` · ${auth.reason.replace(/_/g, ' ')}` : ''}
                          </p>
                          <p className="mt-0.5 flex items-center gap-1 text-caption text-muted-foreground/70">
                            <Clock className="size-3" aria-hidden />
                            {formatDateTime(auth.createdAt)}
                            {auth.latencyMs !== null
                              ? ` · decided in ${auth.latencyMs}ms`
                              : ''}
                          </p>
                        </div>
                      </li>
                    );
                  })}
                </ol>
              </div>
            </>
          ) : null}
        </div>
      </SheetContent>
    </Sheet>
  );
}

function Row({
  label,
  value,
  mono,
  wrap,
}: {
  label: string;
  value: React.ReactNode;
  mono?: boolean;
  wrap?: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <dt className="shrink-0 text-ui text-muted-foreground">{label}</dt>
      <dd
        className={[
          'text-right text-ui font-semibold text-foreground',
          mono ? 'font-mono text-caption' : '',
          wrap ? 'break-all' : 'truncate',
        ].join(' ')}
      >
        {value}
      </dd>
    </div>
  );
}
