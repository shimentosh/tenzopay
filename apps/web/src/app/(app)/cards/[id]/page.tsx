'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import {
  ArrowLeft,
  Ban,
  Eye,
  Gauge,
  Globe,
  Lock,
  Nfc,
  Repeat,
  Snowflake,
  Sun,
  Trash2,
} from 'lucide-react';
import { toast } from 'sonner';
import { api, ApiError } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Alert, EmptyState, Panel, Skeleton, StatusBadge } from '@/components/ui/primitives';
import { SectionHeader } from '@/components/ui/patterns';
import { VirtualCard } from '@/components/virtual-card';
import { TransactionList } from '@/components/app/transaction-list';
import { CardLimitsForm } from '@/components/app/card-limits-form';
import { RevealCardDialog } from '@/components/app/reveal-card-dialog';
import { cn, usd } from '@/lib/utils';
import type { CardSummary, Paginated, TransactionRow } from '@tenzopay/shared';

interface CardDetail extends CardSummary {
  rules: {
    id: string;
    type: string;
    state: string;
    period: string;
    limitAmount: string | null;
  }[];
  supportedControls: Record<string, boolean>;
}

export default function CardDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [revealOpen, setRevealOpen] = useState(false);

  const { data: card, isLoading } = useQuery({
    queryKey: ['card', params.id],
    queryFn: () => api.get<CardDetail>(`/cards/${params.id}`),
  });

  const { data: transactions } = useQuery({
    queryKey: ['card-transactions', params.id],
    queryFn: () =>
      api.get<Paginated<TransactionRow>>(
        `/transactions?cardId=${params.id}&limit=10`,
      ),
    enabled: !!card,
  });

  const statusMutation = useMutation({
    mutationFn: (action: 'freeze' | 'unfreeze' | 'close') =>
      api.patch(`/cards/${params.id}/status`, { action }),
    onSuccess: (_data, action) => {
      toast.success(
        action === 'freeze'
          ? 'Card frozen. New transactions will be declined.'
          : action === 'unfreeze'
            ? 'Card unfrozen.'
            : 'Card closed permanently.',
      );
      void queryClient.invalidateQueries({ queryKey: ['card', params.id] });
      void queryClient.invalidateQueries({ queryKey: ['cards'] });
      router.refresh();
    },
    onError: (error) => {
      toast.error(
        error instanceof ApiError
          ? error.message
          : 'We could not update the card.',
      );
    },
  });

  if (isLoading) {
    return (
      <div className="space-y-10">
        <Skeleton className="h-5 w-32" />
        <Skeleton className="h-64 w-full rounded-panel" />
        <Skeleton className="h-48 w-full rounded-panel" />
      </div>
    );
  }

  if (!card) {
    return (
      <Panel className="max-w-lg">
        <EmptyState
          title="Card not found"
          description="This card does not exist or is not yours."
          action={
            <Button asChild size="sm" variant="secondary">
              <Link href="/cards">Back to cards</Link>
            </Button>
          }
        />
      </Panel>
    );
  }

  const closed = card.status === 'CLOSED';
  const frozen = card.status === 'FROZEN';

  return (
    <div className="space-y-12">
      <Link
        href="/cards"
        className="inline-flex items-center gap-1.5 rounded text-ui text-content-secondary outline-none transition-colors duration-150 ease hover:text-content-primary focus-visible:ring-2 focus-visible:ring-ring"
      >
        <ArrowLeft className="size-4" aria-hidden />
        All cards
      </Link>

      {/* ---------------------------------------------------------- Header -- */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-title font-semibold text-content-primary">{card.name}</h1>
            <StatusBadge status={card.status} />
          </div>
          <p className="tnum mt-2 text-ui text-content-tertiary">
            Virtual {card.network} · •••• {card.lastFour} · expires {card.expMonth}/
            {card.expYear.slice(-2)}
          </p>
        </div>

        {!closed ? (
          <div className="flex flex-wrap gap-2">
            {/* The one accent action here: seeing the number is what you came for. */}
            <Button onClick={() => setRevealOpen(true)}>
              <Eye aria-hidden />
              View details
            </Button>
            <Button
              variant="secondary"
              loading={statusMutation.isPending}
              onClick={() => statusMutation.mutate(frozen ? 'unfreeze' : 'freeze')}
            >
              {frozen ? (
                <>
                  <Sun aria-hidden />
                  Unfreeze
                </>
              ) : (
                <>
                  <Snowflake aria-hidden />
                  Freeze
                </>
              )}
            </Button>
          </div>
        ) : null}
      </div>

      {frozen ? (
        <Alert tone="warning" title="This card is frozen">
          Authorizations are declined at the network while a card is frozen. Unfreeze it whenever
          you are ready.
        </Alert>
      ) : null}

      {closed ? (
        <Alert tone="critical" title="This card is closed">
          A closed card cannot be reopened. Its transaction history is kept for your records.
        </Alert>
      ) : null}

      {/* ------------------------------------------------------------ Card -- */}
      <section aria-labelledby="usage-heading" className="rounded-panel bg-surface-raised p-6 md:p-8">
        <h2 id="usage-heading" className="sr-only">
          Card and usage
        </h2>
        <div className="grid gap-8 lg:grid-cols-[22rem_1fr] lg:items-center">
          <VirtualCard card={card} />

          <div className="space-y-7">
            <Usage
              label="Spent today"
              spent={card.spentToday}
              limit={card.dailyLimit}
              period="day"
            />
            <Usage
              label="Spent this month"
              spent={card.spentThisMonth}
              limit={card.monthlyLimit}
              period="month"
            />
            <div className="flex items-baseline justify-between gap-4 border-t border-hairline pt-5">
              <span className="text-ui text-content-tertiary">Per transaction</span>
              <span className="tnum text-value font-semibold text-content-primary">
                {card.perTransactionLimit ? usd(card.perTransactionLimit) : 'No limit'}
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* ---------------------------------------------------------- Limits -- */}
      {!closed ? (
        <section aria-labelledby="limits-heading" className="space-y-5">
          <div id="limits-heading">
            <SectionHeader title="Spending limits" />
          </div>
          <p className="max-w-2xl text-ui text-content-secondary">
            Registered with the card issuer and enforced on their infrastructure — not merely
            displayed here. An authorization above any of these is declined at the network, before
            it reaches your balance.
          </p>
          <div className="rounded-panel bg-surface-raised p-6 md:p-8">
            <CardLimitsForm card={card} />
          </div>
        </section>
      ) : null}

      {/* -------------------------------------------------------- Controls -- */}
      <section aria-labelledby="controls-heading" className="space-y-5">
        <div id="controls-heading">
          <SectionHeader title="Controls" />
        </div>
        <p className="max-w-2xl text-ui text-content-secondary">
          Only the controls this card actually supports are shown. A virtual card cannot be tapped
          or used at an ATM, so those are stated as unavailable rather than rendered as switches
          that would do nothing.
        </p>

        <div className="grid gap-4 sm:grid-cols-2">
          <Control
            icon={Globe}
            label="Online payments"
            enabled={card.supportedControls.online}
          />
          <Control
            icon={Snowflake}
            label="Freeze and unfreeze"
            enabled={card.supportedControls.freeze}
          />
          <Control
            icon={Gauge}
            label="Velocity limits"
            enabled={card.supportedControls.velocityRules}
          />
          <Control
            icon={Repeat}
            label="Recurring subscriptions"
            enabled={card.supportedControls.online}
          />
          <Control
            icon={Nfc}
            label="Contactless payments"
            enabled={card.supportedControls.contactless}
            note="Not available on virtual cards"
          />
          <Control
            icon={Ban}
            label="ATM withdrawals"
            enabled={card.supportedControls.atm}
            note="Not available on virtual cards"
          />
        </div>
      </section>

      {/* ----------------------------------------------------------- Rules -- */}
      {card.rules.length ? (
        <section aria-labelledby="rules-heading" className="space-y-5">
          <div id="rules-heading">
            <SectionHeader title="Active rules" />
          </div>
          <p className="max-w-2xl text-ui text-content-secondary">
            Enforced by the card issuer on every authorization.
          </p>
          <ul className="divide-y divide-hairline rounded-panel bg-surface-raised px-6">
            {card.rules.map((rule) => (
              <li key={rule.id} className="flex items-center justify-between gap-4 py-5">
                <div>
                  <p className="text-value font-semibold text-content-primary">
                    {rule.period === 'DAY' ? 'Daily' : 'Monthly'} velocity limit
                  </p>
                  <p className="tnum mt-1 text-ui text-content-tertiary">
                    {rule.limitAmount ? usd(rule.limitAmount) : '—'} per{' '}
                    {rule.period === 'DAY' ? 'day' : 'month'}
                  </p>
                </div>
                <StatusBadge status={rule.state} />
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {/* ---------------------------------------------------- Transactions -- */}
      <section aria-labelledby="tx-heading" className="space-y-2">
        <div id="tx-heading">
          <SectionHeader title="Transactions" seeAllHref={`/transactions?cardId=${card.id}`} />
        </div>
        <TransactionList rows={transactions?.data ?? []} />
      </section>

      {/* ----------------------------------------------------------- Close -- */}
      {!closed ? (
        <section aria-labelledby="close-heading" className="space-y-5">
          <div id="close-heading">
            <SectionHeader title="Close this card" />
          </div>
          <div className="flex flex-wrap items-center justify-between gap-4 rounded-panel bg-surface-raised p-6 md:p-8">
            <p className="max-w-md text-ui text-content-secondary">
              Permanent. A closed card can never be reopened, and any subscription still billing to
              it will start failing.
            </p>
            <Button
              variant="destructiveOutline"
              loading={statusMutation.isPending}
              onClick={() => {
                if (
                  window.confirm(
                    `Close “${card.name}” permanently? This cannot be undone.`,
                  )
                ) {
                  statusMutation.mutate('close');
                }
              }}
            >
              <Trash2 aria-hidden />
              Close card
            </Button>
          </div>
        </section>
      ) : null}

      <RevealCardDialog
        cardId={card.id}
        cardName={card.name}
        open={revealOpen}
        onOpenChange={setRevealOpen}
      />
    </div>
  );
}

/**
 * Spend against a ceiling.
 *
 * A bar rather than two numbers: the useful question is how much room is left,
 * and that reads instantly from a filled proportion. Both values are USD cents
 * as strings, so the arithmetic stays in BigInt.
 */
function Usage({
  label,
  spent,
  limit,
  period,
}: {
  label: string;
  spent: string;
  limit: string | null;
  period: string;
}) {
  const spentCents = BigInt(spent);
  const limitCents = limit ? BigInt(limit) : null;
  const pct =
    limitCents && limitCents > 0n
      ? Math.min(100, Number((spentCents * 100n) / limitCents))
      : null;

  return (
    <div>
      <div className="flex items-baseline justify-between gap-4">
        <span className="text-ui text-content-tertiary">{label}</span>
        <span className="tnum text-value font-semibold text-content-primary">
          {usd(spent)}
          {limitCents ? (
            <span className="font-normal text-content-tertiary"> of {usd(limit as string)}</span>
          ) : null}
        </span>
      </div>

      {pct === null ? (
        <p className="mt-2 text-ui text-content-tertiary">No {period} limit set</p>
      ) : (
        <>
          <div
            className="mt-3 h-2 overflow-hidden rounded-pill bg-surface-raised-hover"
            role="progressbar"
            aria-valuenow={pct}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={`${label} against the ${period} limit`}
          >
            <div
              className={cn('h-full rounded-pill', pct >= 100 ? 'bg-negative' : 'bg-brand')}
              style={{ width: `${Math.max(pct, 1)}%` }}
            />
          </div>
          <p className="mt-2 text-caption text-content-tertiary">
            {pct >= 100
              ? `The ${period} limit is used up — further authorizations are declined.`
              : `${100 - pct}% of the ${period} limit still available`}
          </p>
        </>
      )}
    </div>
  );
}

function Control({
  icon: Icon,
  label,
  enabled,
  note,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  enabled: boolean;
  note?: string;
}) {
  return (
    <div
      className={cn(
        'flex items-start gap-4 rounded-card bg-surface-raised p-5',
        !enabled && 'opacity-70',
      )}
    >
      <span
        className={cn(
          'flex size-10 shrink-0 items-center justify-center rounded-full',
          enabled ? 'bg-brand text-content-on-accent' : 'bg-surface-raised-hover text-content-tertiary',
        )}
        aria-hidden
      >
        {enabled ? <Icon className="size-5" /> : <Lock className="size-4" />}
      </span>
      <div className="min-w-0">
        <p className="text-value font-semibold text-content-primary">{label}</p>
        <p className="mt-1 text-ui text-content-tertiary">
          {enabled ? 'Supported' : (note ?? 'Unavailable')}
        </p>
      </div>
    </div>
  );
}
