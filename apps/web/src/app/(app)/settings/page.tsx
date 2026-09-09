'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { toast } from 'sonner';
import { BadgeCheck, LogOut, ShieldAlert } from 'lucide-react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import {
  EmptyState,
  Panel,
  PanelHeader,
  Skeleton,
  StatusBadge,
} from '@/components/ui/primitives';
import { formatDateTime, relativeTime } from '@/lib/utils';

interface Me {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  status: string;
  emailVerifiedAt: string | null;
  createdAt: string;
  kycStatus: string;
  kycReasons: string[];
}

interface Notification {
  id: string;
  type: string;
  title: string;
  body: string;
  readAt: string | null;
  createdAt: string;
}

export default function SettingsPage() {
  const router = useRouter();
  const queryClient = useQueryClient();

  const { data: me, isLoading } = useQuery({
    queryKey: ['me'],
    queryFn: () => api.get<Me>('/auth/me'),
  });

  const { data: notifications } = useQuery({
    queryKey: ['notifications'],
    queryFn: () => api.get<Notification[]>('/notifications?limit=15'),
  });

  const readAll = useMutation({
    mutationFn: () => api.post('/notifications/read-all'),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['notifications'] });
      void queryClient.invalidateQueries({ queryKey: ['notifications-count'] });
    },
  });

  const logoutAll = useMutation({
    mutationFn: () => api.post('/auth/logout-all'),
    onSuccess: () => {
      toast.success('Signed out on all devices.');
      router.replace('/login');
    },
  });

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-56 w-full rounded-card" />
      </div>
    );
  }

  return (
    <div className="space-y-10">
      <h1 className="text-title font-semibold text-content-primary">
        Settings
      </h1>

      <Panel>
        <PanelHeader title="Profile" />
        <dl className="divide-y divide-hairline">
          <Row label="Name" value={[me?.firstName, me?.lastName].filter(Boolean).join(' ') || '—'} />
          <Row label="Email" value={me?.email ?? '—'} />
          <Row
            label="Email verified"
            value={me?.emailVerifiedAt ? formatDateTime(me.emailVerifiedAt) : 'Not verified'}
          />
          <Row label="Member since" value={formatDateTime(me?.createdAt)} />
          <Row
            label="Account status"
            value={me ? <StatusBadge status={me.status} /> : '—'}
          />
        </dl>
      </Panel>

      <Panel>
        <PanelHeader title="Identity verification" />
        <div className="flex flex-wrap items-center justify-between gap-3 p-5">
          <div className="flex items-center gap-3">
            {me?.kycStatus === 'ACCEPTED' ? (
              <BadgeCheck className="size-5 text-positive" aria-hidden />
            ) : (
              <ShieldAlert className="size-5 text-warning" aria-hidden />
            )}
            <div>
              <p className="text-ui font-semibold text-foreground">
                {me?.kycStatus === 'ACCEPTED'
                  ? 'Your identity is verified'
                  : 'Verification required'}
              </p>
              {me?.kycReasons.length ? (
                <p className="mt-0.5 text-caption text-muted-foreground">
                  {me.kycReasons.join(', ').replace(/_/g, ' ').toLowerCase()}
                </p>
              ) : null}
            </div>
          </div>

          {me?.kycStatus === 'ACCEPTED' ? (
            <StatusBadge status={me.kycStatus} />
          ) : (
            <Button asChild size="sm">
              <Link href="/onboarding">Verify now</Link>
            </Button>
          )}
        </div>
      </Panel>

      <Panel id="notifications">
        <PanelHeader
          title="Notifications"
          action={
            notifications?.some((n) => !n.readAt) ? (
              <Button
                size="sm"
                variant="ghost"
                loading={readAll.isPending}
                onClick={() => readAll.mutate()}
              >
                Mark all read
              </Button>
            ) : null
          }
        />

        {notifications?.length ? (
          <ul className="divide-y divide-hairline">
            {notifications.map((notification) => (
              <li
                key={notification.id}
                className="flex gap-3 px-5 py-3.5"
              >
                <span
                  className={`mt-1.5 size-2 shrink-0 rounded-full ${
                    notification.readAt ? 'bg-border' : 'bg-accent0'
                  }`}
                  aria-hidden
                />
                <div className="min-w-0 flex-1">
                  <p className="text-ui font-semibold text-foreground">
                    {notification.title}
                  </p>
                  <p className="text-ui text-muted-foreground">{notification.body}</p>
                </div>
                <span className="shrink-0 text-caption text-muted-foreground">
                  {relativeTime(notification.createdAt)}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState title="No notifications" description="You are all caught up." />
        )}
      </Panel>

      <Panel>
        <PanelHeader
          title="Security"
          description="Signing out everywhere revokes every active session immediately."
        />
        <div className="flex flex-wrap items-center justify-between gap-3 p-5">
          <p className="text-ui text-muted-foreground">
            Sign out on all devices, including this one.
          </p>
          <Button
            variant="secondary"
            size="sm"
            loading={logoutAll.isPending}
            onClick={() => logoutAll.mutate()}
          >
            <LogOut className="size-4" aria-hidden />
            Sign out everywhere
          </Button>
        </div>
      </Panel>
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 px-5 py-3.5">
      <dt className="text-ui text-muted-foreground">{label}</dt>
      <dd className="text-ui font-semibold text-foreground">{value}</dd>
    </div>
  );
}
