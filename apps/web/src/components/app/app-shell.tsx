'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState } from 'react';
import {
  ArrowDownToLine,
  CreditCard,
  ExternalLink,
  LayoutDashboard,
  LogOut,
  Menu,
  Receipt,
  Settings,
  ShieldCheck,
  User,
} from 'lucide-react';
import { api } from '@/lib/api';
import { cn, initials } from '@/lib/utils';
import { Logo } from '@/components/logo';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { NavItem } from '@/components/ui/patterns';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { GlobalSearch } from '@/components/app/global-search';
import { ThemeToggle } from '@/components/theme-provider';
import { NotificationsMenu } from '@/components/app/notifications-menu';
import type { SessionUser } from '@tenzopay/shared';

const nav = [
  { href: '/dashboard', label: 'Overview', icon: LayoutDashboard },
  { href: '/cards', label: 'Cards', icon: CreditCard },
  { href: '/deposit', label: 'Deposit', icon: ArrowDownToLine },
  { href: '/transactions', label: 'Transactions', icon: Receipt },
  { href: '/settings', label: 'Settings', icon: Settings },
];

interface RuntimeConfig {
  appEnv: string;
  depositMode: string;
  cardProvider: string;
  blockchainProvider: string;
}

export function AppShell({
  user,
  config,
  children,
}: {
  user: SessionUser;
  config?: RuntimeConfig;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);

  async function signOut() {
    await api.post('/auth/logout').catch(() => undefined);
    router.replace('/login');
    router.refresh();
  }

  const isActive = (href: string) =>
    href === '/dashboard' ? pathname === href : pathname.startsWith(href);

  return (
    <div className="min-h-dvh bg-background">
      <EnvironmentBanner config={config} />

      <div className="flex">
        {/*
          Desktop rail. Deliberately the same background as the page, with no
          border and no shadow — it reads as part of the canvas rather than as
          a panel bolted to the side.
        */}
        <aside className="sticky top-0 hidden h-dvh w-[17.25rem] shrink-0 flex-col px-4 py-5 lg:flex">
          <div className="flex h-12 items-center px-3">
            <Link href="/dashboard" aria-label="TenzoPay dashboard">
              <Logo />
            </Link>
          </div>

          <div className="mt-4">
            <GlobalSearch />
          </div>

          <nav className="mt-4 flex-1 space-y-1" aria-label="Main">
            {nav.map((item) => (
              <NavItem key={item.href} {...item} active={isActive(item.href)} />
            ))}
          </nav>

          {/* Notifications and theme live here, so the top bar can stay empty. */}
          <div className="space-y-1">
            <div className="flex items-center gap-1 px-1 pb-1">
              <NotificationsMenu />
              <ThemeToggle />
            </div>
            <Button variant="ghost" className="w-full justify-start px-3" onClick={signOut}>
              <LogOut aria-hidden />
              Sign out
            </Button>
          </div>
        </aside>

        <div className="min-w-0 flex-1">
          {/*
            Top bar: no title, no search, no notification cluster. One or two
            contextual pills and the account chip, floating on the page.
          */}
          <header className="flex h-16 items-center gap-2 px-4 sm:px-6">
            <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon" className="lg:hidden" aria-label="Open menu">
                  <Menu />
                </Button>
              </SheetTrigger>

              <SheetContent side="left" className="w-72 p-4">
                <SheetHeader className="h-12 justify-center px-2">
                  <SheetTitle className="sr-only">Navigation</SheetTitle>
                  <Logo />
                </SheetHeader>

                <nav className="mt-4 flex-1 space-y-1" aria-label="Mobile">
                  {nav.map((item) => (
                    <NavItem
                      key={item.href}
                      {...item}
                      active={isActive(item.href)}
                      onClick={() => setMobileOpen(false)}
                    />
                  ))}
                </nav>

                <div className="space-y-1">
                  <div className="flex items-center gap-1 px-1 pb-1">
                    <NotificationsMenu />
                    <ThemeToggle />
                  </div>
                  <Button variant="secondary" className="w-full" onClick={signOut}>
                    <LogOut aria-hidden />
                    Sign out
                  </Button>
                </div>
              </SheetContent>
            </Sheet>

            <Link href="/dashboard" className="lg:hidden" aria-label="TenzoPay">
              <Logo showWordmark={false} />
            </Link>

            <div className="ml-auto flex items-center gap-2">
              {/*
                Staff switcher. Only rendered for a customer whose email also
                has an active console account. It is a link, not a privilege —
                the console sits on its own origin and demands its own login.
              */}
              {user.staffAccess ? (
                <Button asChild variant="secondary" size="sm" className="hidden sm:inline-flex">
                  <a
                    href={user.staffAccess.consoleUrl}
                    // A separate origin and a separate session; opening in
                    // place would silently lose the customer context.
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <ShieldCheck aria-hidden />
                    Console
                    <ExternalLink className="size-3 opacity-60" aria-hidden />
                  </a>
                </Button>
              ) : null}

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="secondary" size="sm" className="gap-2 pl-1.5 pr-4">
                    <Avatar className="size-7">
                      <AvatarFallback className="bg-brand text-caption font-semibold text-content-on-accent">
                        {initials(user.firstName, user.lastName)}
                      </AvatarFallback>
                    </Avatar>
                    <span className="hidden sm:block">{user.firstName ?? 'Account'}</span>
                  </Button>
                </DropdownMenuTrigger>

                <DropdownMenuContent align="end" className="w-56">
                  <DropdownMenuLabel className="font-normal">
                    <p className="text-ui font-semibold text-content-primary">
                      {[user.firstName, user.lastName].filter(Boolean).join(' ') || 'Account'}
                    </p>
                    <p className="truncate text-caption text-content-tertiary">{user.email}</p>
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem asChild>
                    <Link href="/settings">
                      <User aria-hidden />
                      Profile and settings
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Link href="/deposit">
                      <ArrowDownToLine aria-hidden />
                      Add money
                    </Link>
                  </DropdownMenuItem>
                  {/* Same switcher for narrow screens, where the header
                      button is hidden. */}
                  {user.staffAccess ? (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem asChild className="sm:hidden">
                        <a
                          href={user.staffAccess.consoleUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          <ShieldCheck aria-hidden />
                          Staff console
                        </a>
                      </DropdownMenuItem>
                      <DropdownMenuLabel className="hidden font-normal sm:block">
                        <span className="text-caption text-content-tertiary">
                          Staff access · {user.staffAccess.role.replace(/_/g, ' ').toLowerCase()}
                        </span>
                      </DropdownMenuLabel>
                    </>
                  ) : null}

                  <DropdownMenuSeparator />
                  <DropdownMenuItem onSelect={signOut}>
                    <LogOut aria-hidden />
                    Sign out
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </header>

          {/*
            A narrow measure is a large part of why this reads as calm, so the
            column stops at 832px and stays left-aligned on wide screens.
          */}
          <main id="main" className="w-full max-w-[52rem] px-4 pb-28 pt-10 sm:px-6 lg:pb-16 lg:pt-16">
            {children}
          </main>
        </div>
      </div>

      {/* --------------------------------------------- Mobile bottom bar */}
      <nav
        className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t border-hairline bg-surface-page lg:hidden"
        aria-label="Primary"
      >
        {nav.map((item) => {
          const active = isActive(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'flex flex-col items-center gap-1 py-2.5 text-caption transition-colors duration-150 ease',
                active ? 'font-semibold text-content-primary' : 'text-content-tertiary',
              )}
            >
              <item.icon className="size-5" aria-hidden />
              {item.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}

/**
 * Environment banner.
 *
 * Sandbox and demo modes are stated plainly at the top of every screen. A user
 * must never be able to mistake simulated funds for real ones — this is the
 * most important pixel in the application, so it is server-rendered rather
 * than fetched after hydration.
 */
function EnvironmentBanner({ config }: { config?: RuntimeConfig }) {
  if (!config || config.appEnv === 'production') return null;

  const parts = [
    config.appEnv === 'development' ? 'Development' : 'Sandbox',
    config.depositMode === 'demo' ? 'simulated deposits' : `${config.depositMode} deposits`,
    `${config.cardProvider} cards`,
  ];

  return (
    <div className="flex items-center justify-center gap-2 bg-content-primary px-4 py-2 text-center text-caption text-surface-page">
      <span className="font-semibold">{parts[0]}</span>
      <span className="opacity-80">
        {parts.slice(1).join(' · ')} — no real funds are held or moved
      </span>
    </div>
  );
}
