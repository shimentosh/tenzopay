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
          <span className="text-sm font-semibold text-white">Console</span>
        </Link>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="rounded-lg p-1.5 text-white/60 hover:bg-card/10 lg:hidden"
          aria-label="Close menu"
        >
          <X className="size-4" />
        </button>
      </div>

      <nav className="flex-1 space-y-0.5 overflow-y-auto px-3 py-2" aria-label="Console">
        {nav.map((item) => {
          const active = isActive(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setOpen(false)}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                active
                  ? 'bg-card/10 text-white'
                  : 'text-white/60 hover:bg-card/5 hover:text-white',
              )}
            >
              <item.icon className="size-[17px]" aria-hidden />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-white/10 p-3">
        <div className="mb-2 px-2">
          <p className="truncate text-xs text-white/50">{admin.email}</p>
          <Badge tone="brand" className="mt-1.5">
            {admin.role.replace(/_/g, ' ')}
          </Badge>
        </div>
        <button
          type="button"
          onClick={signOut}
          className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-white/60 transition-colors hover:bg-card/5 hover:text-white"
        >
          <LogOut className="size-[17px]" aria-hidden />
          Sign out
        </button>
      </div>
    </>
  );

  return (
    <div className="min-h-dvh bg-canvas">
      <div className="flex">
        <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col bg-ink-950 lg:flex">
          {railContent}
        </aside>

        <div className="min-w-0 flex-1">
          <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-border bg-card/90 px-4 backdrop-blur-md sm:px-6">
            <button
              type="button"
              onClick={() => setOpen(true)}
              className="rounded-lg p-2 text-muted-foreground hover:bg-muted lg:hidden"
              aria-label="Open menu"
            >
              <Menu className="size-5" />
            </button>

            <p className="text-sm font-medium text-foreground/80">
              {nav.find((n) => isActive(n.href))?.label ?? 'Console'}
            </p>

            <ThemeToggle className="ml-auto" />

            <span className="rounded-full bg-ink-900 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-white">
              Staff
            </span>
          </header>

          <main id="main" className="p-4 sm:p-6">{children}</main>
        </div>
      </div>

      {open ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div
            className="absolute inset-0 bg-ink-950/60"
            onClick={() => setOpen(false)}
            aria-hidden
          />
          <div
            className="absolute inset-y-0 left-0 flex w-64 flex-col bg-ink-950"
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
