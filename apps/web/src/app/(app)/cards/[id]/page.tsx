'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { ArrowLeft, Eye, Lock, Snowflake, Sun, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { api, ApiError } from '@/lib/api';
import { Button } from '@/components/ui/button';
import {
  Alert,
  EmptyState,
  Panel,
  PanelHeader,
  Skeleton,
  StatusBadge,
} from '@/components/ui/primitives';
import { VirtualCard } from '@/components/virtual-card';
import { TransactionList } from '@/components/app/transaction-list';
import { CardLimitsForm } from '@/components/app/card-limits-form';
import { RevealCardDialog } from '@/components/app/reveal-card-dialog';
import { usd } from '@/lib/utils';
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
      <div className="mx-auto max-w-5xl space-y-6">
        <Skeleton className="h-5 w-32" />
        <div className="grid gap-6 lg:grid-cols-[380px_1fr]">
          <Skeleton className="aspect-[1.586/1] rounded-2xl" />
          <Skeleton className="h-64 rounded-2xl" />
        </div>
      </div>
    );
  }

  if (!card) {
    return (
      <Panel className="mx-auto max-w-lg">
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
    <div className="mx-auto max-w-5xl space-y-6">
      <Link
        href="/cards"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="size-4" aria-hidden />
        All cards
      </Link>

      <div className="grid gap-6 lg:grid-cols-[380px_1fr] lg:items-start">
        {/* ------------------------------------------------- Card column */}
        <div className="space-y-4">
          <VirtualCard card={card} />

          <div className="flex flex-wrap gap-2">
            {!closed ? (
              <>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setRevealOpen(true)}
                >
                  <Eye className="size-4" aria-hidden />
                  View details
                </Button>

                <Button
                  variant="secondary"
                  size="sm"
                  loading={statusMutation.isPending}
                  onClick={() =>
                    statusMutation.mutate(frozen ? 'unfreeze' : 'freeze')
                  }
                >
                  {frozen ? (
                    <>
                      <Sun className="size-4" aria-hidden />
                      Unfreeze
                    </>
                  ) : (
                    <>
                      <Snowflake className="size-4" aria-hidden />
                      Freeze
                    </>
                  )}
                </Button>
              </>
            ) : null}
          </div>

          <Panel className="divide-y divide-border">
            <Row label="Status" value={<StatusBadge status={card.status} />} />
            <Row label="Spent today" value={usd(card.spentToday)} />
            <Row label="Spent this month" value={usd(card.spentThisMonth)} />
            <Row
              label="Per transaction"
              value={card.perTransactionLimit ? usd(card.perTransactionLimit) : 'No limit'}
            />
          </Panel>
        </div>

        {/* -------------------------------------------- Controls column */}
        <div className="space-y-6">
          {frozen ? (
            <Alert tone="warning" title="This card is frozen">
              Authorizations are declined at the network while a card is frozen.
              Unfreeze it whenever you are ready.
            </Alert>
          ) : null}

          {closed ? (
            <Alert tone="critical" title="This card is closed">
              A closed card cannot be reopened. Its transaction history is kept
              for your records.
            </Alert>
          ) : null}

          {!closed ? (
            <Panel>
              <PanelHeader
                title="Spending limits"
                description="Enforced by the card network and by your available balance."
              />
              <div className="p-5">
                <CardLimitsForm card={card} />
              </div>
            </Panel>
          ) : null}

          <Panel>
            <PanelHeader
              title="Controls"
              description="Only the controls this card actually supports are shown."
            />
            <ul className="divide-y divide-border">
              {/*
                Deliberately honest: a virtual card cannot be tapped or used at
                an ATM, so those toggles are shown as unavailable rather than
                rendered as switches that do nothing.
              */}
              <ControlRow label="Online payments" enabled={card.supportedControls.online} />
              <ControlRow label="Freeze and unfreeze" enabled={card.supportedControls.freeze} />
              <ControlRow label="Velocity limits" enabled={card.supportedControls.velocityRules} />
              <ControlRow
                label="Contactless payments"
                enabled={card.supportedControls.contactless}
                note="Not available on virtual cards"
              />
              <ControlRow
                label="ATM withdrawals"
                enabled={card.supportedControls.atm}
                note="Not available on virtual cards"
              />
            </ul>
          </Panel>

          {card.rules.length ? (
            <Panel>
              <PanelHeader
                title="Active rules"
                description="Enforced by the card issuer on every authorization."
              />
              <ul className="divide-y divide-border">
                {card.rules.map((rule) => (
                  <li
                    key={rule.id}
                    className="flex items-center justify-between px-5 py-3.5"
                  >
                    <div>
                      <p className="text-sm font-medium text-foreground">
                        {rule.period === 'DAY' ? 'Daily' : 'Monthly'} velocity limit
                      </p>
                      <p className="tnum text-xs text-muted-foreground">
                        {rule.limitAmount ? usd(rule.limitAmount) : '—'} per{' '}
                        {rule.period === 'DAY' ? 'day' : 'month'}
                      </p>
                    </div>
                    <StatusBadge status={rule.state} />
                  </li>
                ))}
              </ul>
            </Panel>
          ) : null}

          <Panel>
            <PanelHeader title="Card transactions" />
            <TransactionList rows={transactions?.data ?? []} />
          </Panel>

          {!closed ? (
            <Panel className="border-critical/25 bg-critical-soft/40">
              <div className="flex flex-wrap items-center justify-between gap-3 p-5">
                <div>
                  <p className="text-sm font-medium text-foreground">Close this card</p>
                  <p className="mt-0.5 text-sm text-muted-foreground">
                    Permanent. A closed card can never be reopened.
                  </p>
                </div>
                <Button
                  variant="destructiveOutline"
                  size="sm"
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
                  <Trash2 className="size-4" aria-hidden />
                  Close card
                </Button>
              </div>
            </Panel>
          ) : null}
        </div>
      </div>

      <RevealCardDialog
        cardId={card.id}
        cardName={card.name}
        open={revealOpen}
        onOpenChange={setRevealOpen}
      />
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between px-5 py-3">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="tnum text-sm font-medium text-foreground">{value}</span>
    </div>
  );
}

function ControlRow({
  label,
  enabled,
  note,
}: {
  label: string;
  enabled: boolean;
  note?: string;
}) {
  return (
    <li className="flex items-center justify-between px-5 py-3.5">
      <div>
        <p className="text-sm text-foreground">{label}</p>
        {note ? <p className="text-xs text-muted-foreground">{note}</p> : null}
      </div>
      {enabled ? (
        <span className="text-xs font-medium text-positive">Supported</span>
      ) : (
        <span className="flex items-center gap-1 text-xs text-muted-foreground">
          <Lock className="size-3" aria-hidden />
          Unavailable
        </span>
      )}
    </li>
  );
}
