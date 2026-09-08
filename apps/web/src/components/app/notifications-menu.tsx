'use client';

import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Bell,
  BellOff,
  CreditCard,
  ShieldAlert,
  Snowflake,
  Wallet,
  XCircle,
} from 'lucide-react';
import { api } from '@/lib/api';
import { relativeTime } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/primitives';
import { Separator } from '@/components/ui/separator';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

interface Notification {
  id: string;
  type: string;
  title: string;
  body: string;
  readAt: string | null;
  createdAt: string;
}

const icons: Record<string, React.ElementType> = {
  DEPOSIT_CONFIRMED: Wallet,
  DEPOSIT_DETECTED: Wallet,
  CARD_CREATED: CreditCard,
  CARD_FROZEN: Snowflake,
  TRANSACTION_DECLINED: XCircle,
  KYC_UPDATE: ShieldAlert,
  SECURITY: ShieldAlert,
};

/**
 * Notifications.
 *
 * The list is only fetched once the menu is opened — a badge count is cheap,
 * a full list on every page load is not. Opening also marks everything read,
 * which is the behaviour the unread dot implies.
 */
export function NotificationsMenu() {
  const queryClient = useQueryClient();

  const { data: count } = useQuery({
    queryKey: ['notifications-count'],
    queryFn: () => api.get<{ unread: number }>('/notifications/unread-count'),
    retry: false,
    refetchInterval: 60_000,
  });

  const { data: notifications, isLoading } = useQuery({
    queryKey: ['notifications'],
    queryFn: () => api.get<Notification[]>('/notifications?limit=12'),
    enabled: false, // fetched on open
  });

  const markRead = useMutation({
    mutationFn: () => api.post('/notifications/read-all'),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['notifications-count'] });
    },
  });

  const unread = count?.unread ?? 0;

  function onOpenChange(open: boolean) {
    if (!open) return;
    void queryClient.refetchQueries({ queryKey: ['notifications'] });
    if (unread > 0) markRead.mutate();
  }

  return (
    <DropdownMenu onOpenChange={onOpenChange}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative"
          aria-label={unread ? `Notifications, ${unread} unread` : 'Notifications'}
        >
          <Bell aria-hidden />
          {unread > 0 ? (
            <span className="absolute right-1.5 top-1.5 size-2 rounded-full bg-destructive ring-2 ring-card" />
          ) : null}
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-80 p-0">
        <div className="flex items-center justify-between px-3 py-2.5">
          <p className="text-sm font-semibold">Notifications</p>
          {unread > 0 ? (
            <span className="rounded-full bg-accent px-2 py-0.5 text-[11px] font-medium text-accent-foreground">
              {unread} new
            </span>
          ) : null}
        </div>

        <Separator />

        <div className="max-h-96 overflow-y-auto">
          {isLoading ? (
            <div className="space-y-2 p-3">
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : notifications?.length ? (
            <ul className="divide-y">
              {notifications.map((notification) => {
                const Icon = icons[notification.type] ?? Bell;
                return (
                  <li key={notification.id} className="flex gap-3 px-3 py-3">
                    <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
                      <Icon className="size-3.5" aria-hidden />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium leading-tight">
                        {notification.title}
                      </p>
                      <p className="mt-0.5 text-xs leading-snug text-muted-foreground">
                        {notification.body}
                      </p>
                      <p className="mt-1 text-[11px] text-muted-foreground/70">
                        {relativeTime(notification.createdAt)}
                      </p>
                    </div>
                    {!notification.readAt ? (
                      <span
                        className="mt-1.5 size-1.5 shrink-0 rounded-full bg-primary"
                        aria-label="Unread"
                      />
                    ) : null}
                  </li>
                );
              })}
            </ul>
          ) : (
            <div className="flex flex-col items-center px-4 py-10 text-center">
              <BellOff className="size-5 text-muted-foreground/60" aria-hidden />
              <p className="mt-2 text-sm text-muted-foreground">
                No notifications yet
              </p>
            </div>
          )}
        </div>

        <Separator />

        <Link
          href="/settings#notifications"
          className="block px-3 py-2.5 text-center text-xs font-medium text-primary hover:underline"
        >
          View all in settings
        </Link>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
