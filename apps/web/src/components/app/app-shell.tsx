'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState } from 'react';
import {
  ArrowDownToLine,
  Bell,
  CreditCard,
  LayoutDashboard,
  LogOut,
  Menu,
  Receipt,
  Settings,
  User,
} from 'lucide-react';
import { api } from '@/lib/api';
import { cn, initials } from '@/lib/utils';
import { Logo } from '@/components/logo';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/primitives';
import { Separator } from '@/components/ui/separator';
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
        {/* ------------------------------------------------- Desktop rail */}
        <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col border-r bg-card lg:flex">
          <div className="flex h-16 items-center px-5">
            <Link href="/dashboard" aria-label="TenzoPay dashboard">
              <Logo />
            </Link>
          </div>

          <nav className="flex-1 space-y-1 px-3 py-2" aria-label="Main">
            {nav.map((item) => (
              <NavLink key={item.href} {...item} active={isActive(item.href)} />
            ))}
          </nav>

          <div className="p-3">
            <Separator className="mb-3" />
            <Button
              variant="ghost"
              className="w-full justify-start"
              onClick={signOut}
            >
              <LogOut aria-hidden />
              Sign out
            </Button>
          </div>
        </aside>

        <div className="min-w-0 flex-1">
          {/* --------------------------------------------------- Top bar */}
          <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b bg-card/90 px-4 backdrop-blur-md sm:px-6">
            <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
              <SheetTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="lg:hidden"
                  aria-label="Open menu"
                >
                  <Menu />
                </Button>
              </SheetTrigger>

              <SheetContent side="left" className="w-64 p-0">
                <SheetHeader className="h-16 justify-center px-5">
                  <SheetTitle className="sr-only">Navigation</SheetTitle>
                  <Logo />
                </SheetHeader>

                <nav className="flex-1 space-y-1 px-3" aria-label="Mobile">
                  {nav.map((item) => (
                    <NavLink
                      key={item.href}
                      {...item}
                      active={isActive(item.href)}
                      onClick={() => setMobileOpen(false)}
                    />
                  ))}
                </nav>

                <div className="p-3">
                  <Separator className="mb-3" />
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

            <GlobalSearch />

            <div className="ml-auto flex items-center gap-1.5">
              <ThemeToggle />

              <NotificationsMenu />

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" className="h-10 gap-2 px-1.5">
                    <Avatar className="size-7">
                      <AvatarFallback className="bg-primary text-[11px] font-semibold text-primary-foreground">
                        {initials(user.firstName, user.lastName)}
                      </AvatarFallback>
                    </Avatar>
                    <span className="hidden text-sm font-medium text-foreground sm:block">
                      {user.firstName ?? 'Account'}
                    </span>
                  </Button>
                </DropdownMenuTrigger>

                <DropdownMenuContent align="end" className="w-56">
                  <DropdownMenuLabel className="font-normal">
                    <p className="text-sm font-medium">
                      {[user.firstName, user.lastName].filter(Boolean).join(' ') ||
                        'Account'}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {user.email}
                    </p>
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem asChild>
                    <Link href="/settings">
                      <User aria-hidden />
                      Profile & settings
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Link href="/deposit">
                      <ArrowDownToLine aria-hidden />
                      Deposit funds
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onSelect={signOut}>
                    <LogOut aria-hidden />
                    Sign out
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </header>

          <main id="main" className="px-4 pb-24 pt-6 sm:px-6 lg:pb-10">
            {children}
          </main>
        </div>
      </div>

      {/* --------------------------------------------- Mobile bottom bar */}
      <nav
        className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t bg-card/95 backdrop-blur-md lg:hidden"
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
                'flex flex-col items-center gap-1 py-2.5 text-[10px] font-medium transition-colors',
                active ? 'text-primary' : 'text-muted-foreground',
              )}
            >
              <item.icon className="size-[18px]" aria-hidden />
              {item.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}

function NavLink({
  href,
  label,
  icon: Icon,
  active,
  onClick,
}: {
  href: string;
  label: string;
  icon: React.ElementType;
  active: boolean;
  onClick?: () => void;
}) {
  return (
    <Link
      href={href}
      onClick={onClick}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
        active
          ? 'bg-accent text-accent-foreground'
          : 'text-muted-foreground hover:bg-muted hover:text-foreground',
      )}
    >
      <Icon className="size-[18px]" aria-hidden />
      {label}
    </Link>
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
    config.depositMode === 'demo'
      ? 'simulated deposits'
      : `${config.depositMode} deposits`,
    `${config.cardProvider} cards`,
  ];

  return (
    <div className="flex items-center justify-center gap-2 bg-ink-900 px-4 py-1.5 text-center text-[11px] font-medium text-white/90">
      <Badge tone="warning" className="px-1.5 py-0 text-[10px]">
        {parts[0]}
      </Badge>
      <span>{parts.slice(1).join(' · ')} — no real funds are held or moved</span>
    </div>
  );
}
