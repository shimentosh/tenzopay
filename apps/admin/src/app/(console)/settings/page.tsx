'use client';

import { useQuery } from '@tanstack/react-query';
import { Check, Lock, Minus } from 'lucide-react';
import { api } from '@/lib/api';
import { Alert, Badge, Panel, PanelHeader, Skeleton } from '@/components/ui/primitives';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

interface AdminIdentity {
  id: string;
  email: string;
  role: string;
}

interface RuntimeConfig {
  appEnv: string;
  depositMode: string;
  depositNetwork: string;
  cardProvider: string;
  blockchainProvider: string;
  requiredConfirmations: number;
  currency: string;
}

/**
 * Console settings.
 *
 * Read-only on purpose. Everything shown here is set by environment
 * configuration and validated at boot; exposing an in-app editor for the card
 * provider or deposit mode would let someone put the platform into an unsafe
 * state at runtime, which the config layer exists to prevent.
 */
const capabilities: {
  role: string;
  viewAll: boolean;
  freezeUserCard: boolean;
  adjustLedger: boolean;
  reconcileDeposit: boolean;
  replayWebhook: boolean;
}[] = [
  {
    role: 'SUPER_ADMIN',
    viewAll: true,
    freezeUserCard: true,
    adjustLedger: true,
    reconcileDeposit: true,
    replayWebhook: true,
  },
  {
    role: 'ADMIN',
    viewAll: true,
    freezeUserCard: true,
    adjustLedger: false,
    reconcileDeposit: true,
    replayWebhook: true,
  },
  {
    role: 'FINANCE',
    viewAll: true,
    freezeUserCard: false,
    adjustLedger: true,
    reconcileDeposit: true,
    replayWebhook: false,
  },
  {
    role: 'RISK',
    viewAll: true,
    freezeUserCard: true,
    adjustLedger: false,
    reconcileDeposit: false,
    replayWebhook: false,
  },
  {
    role: 'SUPPORT',
    viewAll: true,
    freezeUserCard: false,
    adjustLedger: false,
    reconcileDeposit: false,
    replayWebhook: false,
  },
];

export default function ConsoleSettingsPage() {
  const { data: admin } = useQuery({
    queryKey: ['admin-me'],
    queryFn: () => api.get<AdminIdentity>('/admin/me'),
  });

  const { data: config, isLoading } = useQuery({
    queryKey: ['runtime-config'],
    queryFn: () => api.get<RuntimeConfig>('/config'),
  });

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <Panel>
        <PanelHeader title="Your access" />
        <dl className="divide-y">
          <Row label="Signed in as" value={admin?.email ?? '—'} />
          <Row
            label="Role"
            value={
              admin ? (
                <Badge tone="brand">{admin.role.replace(/_/g, ' ')}</Badge>
              ) : (
                '—'
              )
            }
          />
        </dl>
      </Panel>

      <Panel>
        <PanelHeader
          title="Runtime configuration"
          description="Set by environment variables and validated at startup."
        />
        {isLoading ? (
          <div className="space-y-2 p-5">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-8 w-full" />
            ))}
          </div>
        ) : (
          <dl className="divide-y">
            <Row
              label="Environment"
              value={
                <Badge tone={config?.appEnv === 'production' ? 'positive' : 'warning'}>
                  {config?.appEnv ?? '—'}
                </Badge>
              }
            />
            <Row
              label="Card provider"
              value={
                <Badge tone={config?.cardProvider === 'lithic' ? 'positive' : 'warning'}>
                  {config?.cardProvider ?? '—'}
                </Badge>
              }
            />
            <Row
              label="Blockchain provider"
              value={
                <Badge
                  tone={config?.blockchainProvider === 'alchemy' ? 'positive' : 'warning'}
                >
                  {config?.blockchainProvider ?? '—'}
                </Badge>
              }
            />
            <Row
              label="Deposit mode"
              value={
                <Badge tone={config?.depositMode === 'demo' ? 'warning' : 'positive'}>
                  {config?.depositMode ?? '—'}
                </Badge>
              }
            />
            <Row label="Deposit network" value={config?.depositNetwork ?? '—'} />
            <Row
              label="Required confirmations"
              value={`${config?.requiredConfirmations ?? '—'} blocks`}
            />
            <Row label="Currency" value={config?.currency ?? '—'} />
          </dl>
        )}
      </Panel>

      {config?.depositMode === 'demo' ? (
        <Alert tone="warning" title="Demo deposits are enabled">
          Deposits in this environment are simulated and labelled throughout the
          customer app. The API refuses to start with demo deposits while
          <code className="mx-1">APP_ENV=production</code>, so this cannot reach
          a live deployment.
        </Alert>
      ) : null}

      <Panel>
        <PanelHeader
          title="Role permissions"
          description="Enforced by the API, not by this interface."
        />
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Role</TableHead>
                <TableHead className="text-center">View</TableHead>
                <TableHead className="text-center">Freeze</TableHead>
                <TableHead className="text-center">Adjust ledger</TableHead>
                <TableHead className="text-center">Reconcile</TableHead>
                <TableHead className="text-center">Replay webhook</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {capabilities.map((row) => (
                <TableRow
                  key={row.role}
                  className={row.role === admin?.role ? 'bg-accent/40' : undefined}
                >
                  <TableCell className="font-medium">
                    {row.role.replace(/_/g, ' ')}
                  </TableCell>
                  <Cell allowed={row.viewAll} />
                  <Cell allowed={row.freezeUserCard} />
                  <Cell allowed={row.adjustLedger} />
                  <Cell allowed={row.reconcileDeposit} />
                  <Cell allowed={row.replayWebhook} />
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </Panel>

      <Alert tone="brand" title="No balance editor exists">
        There is deliberately no control anywhere in this console that sets a
        balance. Correcting customer funds means posting a signed adjustment
        with a written reason, which writes paired ledger entries plus an audit
        record naming you.
      </Alert>
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 px-5 py-3">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="text-sm font-medium text-foreground">{value}</dd>
    </div>
  );
}

function Cell({ allowed }: { allowed: boolean }) {
  return (
    <TableCell className="text-center">
      {allowed ? (
        <Check className="mx-auto size-4 text-positive" aria-label="Allowed" />
      ) : (
        <Minus className="mx-auto size-4 text-muted-foreground/50" aria-label="Denied" />
      )}
    </TableCell>
  );
}
