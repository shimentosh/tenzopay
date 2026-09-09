'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState } from 'react';
import {
  Activity,
  BadgeCheck,
  BookOpen,
  CreditCard,
  FileClock,
  LayoutDashboard,
  LogOut,
  Menu,
  Receipt,
  ShieldAlert,
  PiggyBank,
  Settings,
  Users,
  Wallet,
  Webhook,
  X,
} from 'lucide-react';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import { Logo } from '@/components/logo';
import { Badge } from '@/components/ui/primitives';
import { ThemeToggle } from '@/components/theme-provider';

const nav = [
  { href: '/', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/users', label: 'Users', icon: Users },
  { href: '/kyc', label: 'KYC', icon: BadgeCheck },
  { href: '/deposits', label: 'Deposits', icon: Wallet },
  { href: '/wallets', label: 'Wallets', icon: PiggyBank },
  { href: '/cards', label: 'Cards', icon: CreditCard },
  { href: '/transactions', label: 'Transactions', icon: Receipt },
  { href: '/ledger', label: 'Ledger', icon: BookOpen },
  { href: '/webhooks', label: 'Webhooks', icon: Webhook },
  { href: '/risk', label: 'Risk', icon: ShieldAlert },
  { href: '/audit', label: 'Audit logs', icon: FileClock },
  { href: '/health', label: 'Health', icon: Activity },
  { href: '/settings', label: 'Settings', icon: Settings },
];

export interface AdminIdentity {
  id: string;
  email: string;
  role: string;
}

/**
 * Console chrome.
 *
 * Visually distinct from the customer app on purpose — a dark rail is an
 * immediate signal that you are operating on other people's money, not your
 * own. The role is always on screen because permission is contextual here.
 */
export function ConsoleShell({
  admin,
  children,
}: {
  admin: AdminIdentity;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);

  async function signOut() {
    await api.post('/auth/admin/logout').catch(() => undefined);
    router.replace('/login');
    router.refresh();
  }

  const isActive = (href: string) =>
    href === '/' ? pathname === '/' : pathname.startsWith(href);

  const railContent = (
    <>
      <div className="flex h-16 items-center justify-between px-5">
        <Link href="/" className="flex items-center gap-2.5" aria-label="Console home">
          <Logo inverted showWordmark={false} />
          <span className="text-ui font-semibold text-rail-foreground">Console</span>
        </Link>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="rounded-full p-2 text-rail-muted transition-colors duration-150 ease hover:bg-rail-raised hover:text-rail-foreground lg:hidden"
          aria-label="Close menu"
        >
          <X className="size-4" />
        </button>
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto px-4 py-2" aria-label="Console">
        {nav.map((item) => {
          const active = isActive(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setOpen(false)}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'flex h-11 items-center gap-3 rounded-pill px-3 text-ui transition-colors duration-150 ease',
                active
                  ? 'bg-rail-raised font-semibold text-rail-foreground'
                  : 'text-rail-muted hover:bg-rail-raised hover:text-rail-foreground',
              )}
            >
              <item.icon className="size-[17px]" aria-hidden />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="p-4">
        <div className="mb-2 px-2">
          <p className="truncate text-caption text-rail-muted">{admin.email}</p>
          <Badge tone="brand" className="mt-1.5">
            {admin.role.replace(/_/g, ' ')}
          </Badge>
        </div>
        <button
          type="button"
          onClick={signOut}
          className="flex h-11 w-full items-center gap-3 rounded-pill px-3 text-ui text-rail-muted transition-colors duration-150 ease hover:bg-rail-raised hover:text-rail-foreground"
        >
          <LogOut className="size-[17px]" aria-hidden />
          Sign out
        </button>
      </div>
    </>
  );

  return (
    <div className="min-h-dvh bg-background">
      <div className="flex">
        <aside className="sticky top-0 hidden h-dvh w-[17.25rem] shrink-0 flex-col bg-rail lg:flex">
          {railContent}
        </aside>

        <div className="min-w-0 flex-1">
          <header className="flex h-16 items-center gap-3 px-4 sm:px-6">
            <button
              type="button"
              onClick={() => setOpen(true)}
              className="rounded-full p-2 text-content-secondary transition-colors duration-150 ease hover:bg-surface-raised lg:hidden"
              aria-label="Open menu"
            >
              <Menu className="size-5" />
            </button>

            <p className="text-ui font-semibold text-content-primary">
              {nav.find((n) => isActive(n.href))?.label ?? 'Console'}
            </p>

            <ThemeToggle className="ml-auto" />

            <span className="rounded-pill bg-content-primary px-3 py-1 text-caption font-semibold text-surface-page">
              Staff
            </span>
          </header>

          <main id="main" className="px-4 pb-16 pt-6 sm:px-6 lg:pt-10">{children}</main>
        </div>
      </div>

      {open ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div
            className="absolute inset-0 bg-rail/70"
            onClick={() => setOpen(false)}
            aria-hidden
          />
          <div
            className="absolute inset-y-0 left-0 flex w-72 flex-col bg-rail"
            role="dialog"
            aria-modal="true"
            aria-label="Console navigation"
          >
            {railContent}
          </div>
        </div>
      ) : null}
    </div>
  );
}
