'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { KeyRound, Lock } from 'lucide-react';
import { toast } from 'sonner';
import { api, ApiError } from '@/lib/api';
import { Badge, Panel, PanelHeader, Skeleton } from '@/components/ui/primitives';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

interface Setting {
  key: string;
  label: string;
  description: string;
  type: 'minor' | 'integer' | 'bps';
  group: 'cost' | 'fee' | 'limits';
  value: string;
  isDefault: boolean;
  updatedAt: string | null;
}

interface Credential {
  key: string;
  label: string;
  configured: boolean;
  fingerprint: string | null;
  note: string;
}

const groupTitle: Record<Setting['group'], { title: string; description: string }> = {
  cost: {
    title: 'What providers charge us',
    description:
      'Nothing observes these automatically — they come off your provider invoices. Entered here, they turn the volume on the revenue page into real cost and margin.',
  },
  fee: {
    title: 'What we charge',
    description:
      'Stored and audited, but not yet applied: no code path charges a fee today, so these take effect once fee posting is built.',
  },
  limits: { title: 'Operational limits', description: 'Thresholds staff may tune at runtime.' },
};

/** Exact string maths — a balance must never round through a float. */
function fromMinor(value: string): string {
  const padded = value.padStart(7, '0');
  const whole = padded.slice(0, -6);
  const fraction = padded.slice(-6).replace(/0+$/, '');
  return fraction ? `${whole}.${fraction}` : whole;
}

function toMinor(input: string): string {
  const trimmed = input.trim();
  if (!/^\d+(\.\d{0,6})?$/.test(trimmed)) throw new Error('Use up to six decimal places.');
  const [whole, fraction = ''] = trimmed.split('.');
  return `${whole}${fraction.padEnd(6, '0')}`.replace(/^0+(?=\d)/, '');
}

export function SettingsEditor() {
  const { data, isLoading } = useQuery({
    queryKey: ['admin-settings'],
    queryFn: () => api.get<{ settings: Setting[]; credentials: Credential[] }>('/admin/settings'),
  });

  const groups: Setting['group'][] = ['cost', 'fee', 'limits'];

  return (
    <>
      <Panel>
        <PanelHeader
          title="Credentials"
          description="Status only. Keys live in the environment and are validated at startup — they are never sent to this console and cannot be changed here."
        />

        {isLoading ? (
          <div className="space-y-2 p-5">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-14 w-full" />
            ))}
          </div>
        ) : (
          <ul className="divide-y divide-hairline">
            {data?.credentials.map((credential) => (
              <li
                key={credential.key}
                className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5"
              >
                <div className="min-w-0">
                  <p className="flex items-center gap-2 text-ui font-semibold text-content-primary">
                    <KeyRound className="size-4 text-content-tertiary" aria-hidden />
                    {credential.label}
                  </p>
                  <p className="mt-0.5 text-caption text-content-tertiary">{credential.note}</p>
                </div>
                <div className="flex items-center gap-3">
                  {credential.fingerprint ? (
                    <span className="font-mono text-caption text-content-tertiary">
                      {credential.fingerprint}
                    </span>
                  ) : null}
                  <Badge tone={credential.configured ? 'positive' : 'critical'}>
                    {credential.configured ? 'Configured' : 'Not set'}
                  </Badge>
                </div>
              </li>
            ))}
          </ul>
        )}

        <p className="flex items-start gap-2 px-5 pb-5 pt-1 text-caption leading-relaxed text-content-tertiary">
          <Lock className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          <span>
            The fingerprint is the first eight characters of the key&rsquo;s SHA-256 — enough to
            confirm a rotation took effect, useless to an attacker. The deposit xpub is deliberately
            not editable: changing it would redirect every future customer deposit, so it stays a
            deployment decision rather than a console one.
          </span>
        </p>
      </Panel>

      {groups.map((group) => {
        const rows = data?.settings.filter((setting) => setting.group === group) ?? [];
        return (
          <Panel key={group}>
            <PanelHeader title={groupTitle[group].title} description={groupTitle[group].description} />
            {isLoading ? (
              <div className="space-y-2 p-5">
                {Array.from({ length: 3 }).map((_, i) => (
                  <Skeleton key={i} className="h-16 w-full" />
                ))}
              </div>
            ) : (
              <ul className="divide-y divide-hairline">
                {rows.map((setting) => (
                  <SettingRow key={setting.key} setting={setting} />
                ))}
              </ul>
            )}
          </Panel>
        );
      })}
    </>
  );
}

function SettingRow({ setting }: { setting: Setting }) {
  const queryClient = useQueryClient();
  const initial = setting.type === 'minor' ? fromMinor(setting.value) : setting.value;
  const [value, setValue] = useState(initial);
  const [reason, setReason] = useState('');

  const dirty = value.trim() !== initial;

  const save = useMutation({
    mutationFn: async () => {
      const raw = setting.type === 'minor' ? toMinor(value) : value.trim();
      return api.post('/admin/settings', { key: setting.key, value: raw, reason });
    },
    onSuccess: () => {
      toast.success(`${setting.label} updated.`);
      setReason('');
      void queryClient.invalidateQueries({ queryKey: ['admin-settings'] });
      void queryClient.invalidateQueries({ queryKey: ['admin-revenue'] });
    },
    onError: (error: unknown) => {
      toast.error(
        error instanceof ApiError ? error.message : 'We could not save that setting.',
      );
    },
  });

  return (
    <li className="px-5 py-4">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <p className="text-ui font-semibold text-content-primary">
            {setting.label}
            {setting.isDefault ? (
              <span className="ml-2 text-caption font-normal text-content-tertiary">default</span>
            ) : null}
          </p>
          <p className="mt-0.5 text-caption text-content-tertiary">{setting.description}</p>
        </div>

        <div className="flex items-center gap-2">
          <Input
            value={value}
            onChange={(event) => setValue(event.target.value)}
            inputMode="decimal"
            className="w-36 text-right"
            aria-label={setting.label}
          />
          <span className="w-16 shrink-0 text-caption text-content-tertiary">
            {setting.type === 'minor' ? 'USDT' : setting.type === 'bps' ? 'bps' : ''}
          </span>
        </div>
      </div>

      {dirty ? (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Input
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="Reason for this change (min 10 characters)"
            className="min-w-0 flex-1"
            aria-label={`Reason for changing ${setting.label}`}
          />
          <Button
            size="sm"
            loading={save.isPending}
            disabled={reason.trim().length < 10}
            onClick={() => save.mutate()}
          >
            Save
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              setValue(initial);
              setReason('');
            }}
          >
            Cancel
          </Button>
        </div>
      ) : null}

      {setting.type === 'bps' && /^\d+$/.test(value) ? (
        <p className="mt-2 text-caption text-content-tertiary">
          {(Number(value) / 100).toFixed(2)}%
        </p>
      ) : null}
    </li>
  );
}
