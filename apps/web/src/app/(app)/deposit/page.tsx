'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { AlertTriangle, Check, Copy, ExternalLink, Wallet } from 'lucide-react';
import { toast } from 'sonner';
import { api, ApiError } from '@/lib/api';
import { Button } from '@/components/ui/button';
import {
  Alert,
  Badge,
  EmptyState,
  Field,
  Input,
  Panel,
  PanelHeader,
  Skeleton,
  StatusBadge,
} from '@/components/ui/primitives';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { money, formatDateTime, truncateHash } from '@/lib/utils';
import type { DepositSummary, Paginated } from '@tenzopay/shared';

interface DepositInfo {
  address: string;
  network: string;
  networkLabel: string;
  currency: string;
  contractAddress: string | null;
  requiredConfirmations: number;
  minimumAmount: string;
  mode: 'demo' | 'sandbox' | 'production';
  isDemo: boolean;
  warnings: string[];
}

export default function DepositPage() {
  const queryClient = useQueryClient();
  const [qr, setQr] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [amount, setAmount] = useState('500');

  const { data: info, isLoading, error } = useQuery({
    queryKey: ['deposit-info'],
    queryFn: () => api.get<DepositInfo>('/deposits/address'),
    retry: false,
  });

  const { data: deposits } = useQuery({
    queryKey: ['deposits'],
    queryFn: () => api.get<Paginated<DepositSummary>>('/deposits?limit=20'),
    // Poll while anything is still confirming, so progress is visible.
    refetchInterval: (query) => {
      const rows = query.state.data?.data ?? [];
      return rows.some((d) => d.status === 'DETECTED' || d.status === 'CONFIRMING')
        ? 5_000
        : false;
    },
  });

  useEffect(() => {
    if (!info?.address) return;
    QRCode.toDataURL(info.address, {
      width: 320,
      margin: 1,
      color: { dark: '#111827', light: '#ffffff' },
    })
      .then(setQr)
      .catch(() => setQr(null));
  }, [info?.address]);

  const simulate = useMutation({
    mutationFn: () => api.post('/deposits/simulate', { amount }),
    onSuccess: () => {
      toast.success('Simulated deposit created. Watching for confirmations.');
      void queryClient.invalidateQueries({ queryKey: ['deposits'] });
    },
    onError: (err) => {
      toast.error(
        err instanceof ApiError ? err.message : 'Could not simulate a deposit.',
      );
    },
  });

  async function copyAddress() {
    if (!info?.address) return;
    await navigator.clipboard.writeText(info.address);
    setCopied(true);
    toast.success('Address copied');
    setTimeout(() => setCopied(false), 2000);
  }

  if (error instanceof ApiError && error.code === 'KYC_REQUIRED') {
    return (
      <Panel className="mx-auto max-w-lg">
        <EmptyState
          icon={<Wallet className="size-5" />}
          title="Verification required"
          description="Complete identity verification before depositing funds."
          action={
            <Button asChild size="sm">
              <a href="/onboarding">Verify identity</a>
            </Button>
          }
        />
      </Panel>
    );
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          Deposit USDT
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Funds are credited after the required network confirmations.
        </p>
      </div>

      {info?.isDemo ? (
        <Alert tone="warning" title="Simulated deposits">
          <p>
            This environment runs in demo mode. The address below is not a real
            blockchain address and cannot receive funds — anything sent to it
            would be lost. Use the simulator to exercise the full deposit
            lifecycle.
          </p>
        </Alert>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start">
        <Panel>
          <PanelHeader
            title="Your deposit address"
            description={info?.networkLabel}
          />

          <div className="space-y-5 p-5">
            {isLoading ? (
              <>
                <Skeleton className="mx-auto size-48" />
                <Skeleton className="h-10 w-full" />
              </>
            ) : info ? (
              <>
                <div className="flex justify-center">
                  {qr ? (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img
                      src={qr}
                      alt={`QR code for deposit address ${info.address}`}
                      className="size-48 rounded-xl border bg-card p-2"
                    />
                  ) : (
                    <Skeleton className="size-48 rounded-xl" />
                  )}
                </div>

                <div>
                  <p className="mb-1.5 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    Address
                  </p>
                  <div className="flex items-stretch gap-2">
                    <code className="min-w-0 flex-1 break-all rounded-lg border bg-muted px-3 py-2.5 text-xs text-foreground">
                      {info.address}
                    </code>
                    <Button
                      variant="secondary"
                      size="icon"
                      onClick={copyAddress}
                      aria-label="Copy deposit address"
                    >
                      {copied ? (
                        <Check className="text-positive" />
                      ) : (
                        <Copy />
                      )}
                    </Button>
                  </div>
                </div>

                <dl className="grid grid-cols-2 gap-4 rounded-xl border p-4 text-sm">
                  <div>
                    <dt className="text-xs text-muted-foreground">Network</dt>
                    <dd className="mt-0.5 font-medium text-foreground">
                      {info.networkLabel}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted-foreground">Minimum deposit</dt>
                    <dd className="tnum mt-0.5 font-medium text-foreground">
                      {money(info.minimumAmount)} {info.currency}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted-foreground">Confirmations</dt>
                    <dd className="tnum mt-0.5 font-medium text-foreground">
                      {info.requiredConfirmations} blocks
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted-foreground">Token</dt>
                    <dd className="mt-0.5 font-medium text-foreground">
                      USDT (ERC-20)
                    </dd>
                  </div>
                </dl>

                {/* Network warnings are prominent, not buried — sending on the
                    wrong chain is unrecoverable. */}
                <ul className="space-y-2">
                  {info.warnings.map((warning) => (
                    <li
                      key={warning}
                      className="flex gap-2 rounded-lg bg-warning-soft px-3 py-2.5 text-xs leading-relaxed text-foreground/80"
                    >
                      <AlertTriangle
                        className="mt-px size-3.5 shrink-0 text-warning"
                        aria-hidden
                      />
                      {warning}
                    </li>
                  ))}
                </ul>
              </>
            ) : (
              <EmptyState
                title="Address unavailable"
                description="We could not allocate a deposit address. Please try again shortly."
              />
            )}
          </div>
        </Panel>

        {info?.mode === 'demo' ? (
          <Panel>
            <PanelHeader
              title="Deposit simulator"
              description="Runs the real detection and confirmation pipeline."
            />
            <div className="space-y-4 p-5">
              <Field label="Amount (USDT)" htmlFor="amount">
                <Input
                  id="amount"
                  inputMode="decimal"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                />
              </Field>

              <Button
                className="w-full"
                loading={simulate.isPending}
                onClick={() => simulate.mutate()}
              >
                Simulate deposit
              </Button>

              <p className="text-xs leading-relaxed text-muted-foreground">
                The deposit moves through detection and confirmation exactly as a
                real one would, then posts a ledger credit. These are not real
                funds.
              </p>
            </div>
          </Panel>
        ) : null}
      </div>

      <Panel>
        <PanelHeader title="Deposit history" />

        {deposits?.data.length ? (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Amount</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Confirmations</TableHead>
                  <TableHead>Transaction</TableHead>
                  <TableHead>Date</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {deposits.data.map((deposit) => (
                  <TableRow key={deposit.id}>
                    <TableCell className="tnum font-medium text-foreground">
                      {money(deposit.amount)} {deposit.currency}
                      {deposit.isDemo ? (
                        <Badge
                          tone="neutral"
                          className="ml-2 px-1.5 py-0 text-[10px] uppercase"
                        >
                          Demo
                        </Badge>
                      ) : null}
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={deposit.status} />
                    </TableCell>
                    <TableCell className="tnum text-muted-foreground">
                      {deposit.status === 'CONFIRMED'
                        ? 'Complete'
                        : `${deposit.confirmations} / ${deposit.requiredConfirmations}`}
                    </TableCell>
                    <TableCell>
                      {deposit.txHash ? (
                        <span className="inline-flex items-center gap-1 font-mono text-xs text-muted-foreground">
                          {truncateHash(deposit.txHash)}
                          {!deposit.isDemo ? (
                            <ExternalLink className="size-3" aria-hidden />
                          ) : null}
                        </span>
                      ) : (
                        <span className="text-muted-foreground/60">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {formatDateTime(deposit.createdAt)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ) : (
          <EmptyState
            icon={<Wallet className="size-5" />}
            title="No deposits yet"
            description="Once you send USDT to your address it will appear here."
          />
        )}
      </Panel>
    </div>
  );
}
