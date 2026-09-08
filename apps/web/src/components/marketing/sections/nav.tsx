'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion, useMotionValueEvent, useScroll } from 'framer-motion';
import {
  ArrowDownToLine,
  ChevronDown,
  CreditCard,
  FileText,
  Layers,
  Megaphone,
  Menu,
  Palette,
  ReceiptText,
  Repeat,
  Scale,
  ShieldCheck,
  SlidersHorizontal,
  Snowflake,
  Users,
  Wallet,
  X,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { EASE, STAGGER, useReducedMotionSafe } from '@/lib/motion';
import { SITE } from '@/lib/marketing';
import { Button } from '@/components/marketing/ui/button';
import { BrandWordmark } from '@/components/marketing/ui/wordmarks';

type MenuLink = { label: string; href: string; description: string; icon: LucideIcon };
type Menu = { label: string; columns: { title: string; links: MenuLink[] }[] };

const menus: Menu[] = [
  {
    label: 'Product',
    columns: [
      {
        title: 'Cards',
        links: [
          { label: 'Virtual cards', href: '/virtual-cards', description: 'A card per merchant', icon: CreditCard },
          { label: 'Spend controls', href: '/#controls', description: 'Daily, monthly, per transaction', icon: SlidersHorizontal },
          { label: 'Freeze instantly', href: '/#controls', description: 'Declined at the network', icon: Snowflake },
          { label: 'Card designs', href: '/#cards', description: 'Four faces to pick from', icon: Palette },
        ],
      },
      {
        title: 'Money',
        links: [
          { label: 'One balance', href: '/#preview', description: 'Every card draws on it', icon: Wallet },
          { label: 'Deposits', href: '/how-it-works', description: 'USDT, credited on confirmation', icon: ArrowDownToLine },
          { label: 'Transactions', href: '/#preview', description: 'Every authorization, in order', icon: ReceiptText },
          { label: 'The ledger', href: '/#build', description: 'Double entry, no cached balance', icon: Scale },
        ],
      },
    ],
  },
  {
    label: 'Use cases',
    columns: [
      {
        title: 'People',
        links: [
          { label: 'Freelancers', href: '/#use-cases', description: 'Separate client from personal', icon: Users },
          { label: 'Advertisers', href: '/#use-cases', description: 'One card per ad account', icon: Megaphone },
          { label: 'Subscriptions', href: '/#use-cases', description: 'Cancel by freezing a card', icon: Repeat },
          { label: 'Teams', href: '/#use-cases', description: 'Limits instead of expense claims', icon: Layers },
        ],
      },
      {
        title: 'Read more',
        links: [
          { label: 'Features', href: '/features', description: 'What is in the product today', icon: FileText },
          { label: 'How it works', href: '/how-it-works', description: 'From deposit to authorization', icon: ArrowDownToLine },
        ],
      },
    ],
  },
  {
    label: 'Company',
    columns: [
      {
        title: 'TenzoPay',
        links: [
          { label: 'Security', href: '/security', description: 'How card data is kept out', icon: ShieldCheck },
          { label: 'FAQ', href: '/faq', description: 'Balances, cards and deposits', icon: FileText },
        ],
      },
      {
        title: 'Straight answers',
        links: [
          { label: 'What this build is', href: '/faq', description: 'A preview on sandbox rails', icon: Scale },
          { label: 'Pricing', href: '/pricing', description: 'Three plans, no hidden fees', icon: ReceiptText },
        ],
      },
    ],
  },
];

const plainLinks = [
  { label: 'Developers', href: '/#build' },
  { label: 'Pricing', href: '/pricing' },
];

const mobileLinks = [
  ...menus.flatMap((menu) =>
    menu.columns.flatMap((column) => column.links.map((link) => ({ label: link.label, href: link.href }))),
  ),
  ...plainLinks,
];

export function Nav() {
  const [scrolled, setScrolled] = useState(false);
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const reduce = useReducedMotionSafe();
  const { scrollY } = useScroll();
  const panelRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useMotionValueEvent(scrollY, 'change', (latest) => setScrolled(latest > 40));

  const closeMobile = useCallback(() => {
    setMobileOpen(false);
    triggerRef.current?.focus();
  }, []);

  // Escape closes whichever layer is open; while the overlay is up, Tab is
  // cycled inside it so focus never lands on the page behind.
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        if (mobileOpen) closeMobile();
        else setOpenMenu(null);
        return;
      }

      if (event.key !== 'Tab' || !mobileOpen || !panelRef.current) return;

      const focusable = panelRef.current.querySelectorAll<HTMLElement>('a[href], button:not([disabled])');
      if (focusable.length === 0) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [mobileOpen, closeMobile]);

  useEffect(() => {
    if (!mobileOpen) return;
    document.body.style.overflow = 'hidden';
    panelRef.current?.querySelector<HTMLElement>('a[href]')?.focus();
    return () => {
      document.body.style.overflow = '';
    };
  }, [mobileOpen]);

  const activeMenu = menus.find((menu) => menu.label === openMenu);

  return (
    <header
      className={cn(
        'fixed inset-x-0 top-0 z-50 transition-[background-color,border-color,backdrop-filter] duration-300',
        scrolled
          ? 'border-b border-edge bg-paper/80 backdrop-blur-xl'
          : 'border-b border-transparent bg-transparent',
      )}
      onMouseLeave={() => setOpenMenu(null)}
    >
      <div className="mx-auto flex h-[4.5rem] w-full max-w-container items-center justify-between px-6 md:px-8">
        <Link
          href="/"
          className="rounded-full text-forest focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bright focus-visible:ring-offset-2"
          aria-label={SITE.brand + ' home'}
        >
          <BrandWordmark />
        </Link>

        <nav aria-label="Main" className="hidden lg:block">
          <ul className="flex items-center gap-1">
            {menus.map((menu) => (
              <li key={menu.label} onMouseEnter={() => setOpenMenu(menu.label)}>
                <button
                  type="button"
                  aria-expanded={openMenu === menu.label}
                  onClick={() => setOpenMenu(openMenu === menu.label ? null : menu.label)}
                  onFocus={() => setOpenMenu(menu.label)}
                  className="inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-[0.9375rem] text-forest transition-colors hover:bg-mint/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bright"
                >
                  {menu.label}
                  <ChevronDown
                    className={cn(
                      'size-4 transition-transform duration-200',
                      openMenu === menu.label && 'rotate-180',
                    )}
                    aria-hidden
                  />
                </button>
              </li>
            ))}

            {plainLinks.map((link) => (
              <li key={link.href}>
                <Link
                  href={link.href}
                  onMouseEnter={() => setOpenMenu(null)}
                  className="inline-flex rounded-full px-4 py-2 text-[0.9375rem] text-forest transition-colors hover:bg-mint/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bright"
                >
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <div className="hidden items-center gap-2 lg:flex">
          <Link
            href={SITE.loginHref}
            className="rounded-full px-4 py-2 text-[0.9375rem] text-forest transition-colors hover:bg-mint/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bright"
          >
            Log in
          </Link>
          <Button href={SITE.primaryCta.href}>{SITE.primaryCta.label}</Button>
        </div>

        <button
          ref={triggerRef}
          type="button"
          onClick={() => setMobileOpen(true)}
          aria-expanded={mobileOpen}
          aria-label="Open menu"
          className="inline-flex size-11 items-center justify-center rounded-full text-forest transition-colors hover:bg-mint/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bright lg:hidden"
        >
          <Menu className="size-5" aria-hidden />
        </button>
      </div>

      <AnimatePresence>
        {activeMenu ? (
          <motion.div
            key={activeMenu.label}
            initial={{ opacity: 0, y: reduce ? 0 : -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: reduce ? 0 : -8 }}
            transition={{ duration: 0.25, ease: EASE }}
            className="absolute inset-x-0 top-full hidden border-b border-edge bg-paper lg:block"
          >
            <div className="mx-auto grid w-full max-w-container gap-10 px-8 py-10 md:grid-cols-2">
              {activeMenu.columns.map((column) => (
                <div key={column.title}>
                  <p className="mb-5 text-micro font-medium uppercase text-moss">{column.title}</p>
                  <ul className="space-y-1">
                    {column.links.map((link) => (
                      <li key={link.label}>
                        <Link
                          href={link.href}
                          onClick={() => setOpenMenu(null)}
                          className="group flex items-start gap-4 rounded-3xl p-3 transition-colors hover:bg-bone focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bright"
                        >
                          <span className="mt-0.5 inline-flex size-10 shrink-0 items-center justify-center rounded-full bg-mint text-forest transition-transform duration-200 group-hover:scale-[1.08]">
                            <link.icon className="size-[1.125rem]" aria-hidden />
                          </span>
                          <span>
                            <span className="block text-[0.9375rem] font-medium text-forest">{link.label}</span>
                            <span className="block text-[0.8125rem] text-moss">{link.description}</span>
                          </span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>

      <AnimatePresence>
        {mobileOpen ? (
          <motion.div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-label="Menu"
            initial={{ x: reduce ? 0 : '100%', opacity: reduce ? 0 : 1 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: reduce ? 0 : '100%', opacity: reduce ? 0 : 1 }}
            transition={{ duration: 0.45, ease: EASE }}
            className="fixed inset-0 z-50 flex flex-col bg-paper lg:hidden"
          >
            <div className="flex h-[4.5rem] shrink-0 items-center justify-between px-6">
              <span className="text-forest">
                <BrandWordmark />
              </span>
              <button
                type="button"
                onClick={closeMobile}
                aria-label="Close menu"
                className="inline-flex size-11 items-center justify-center rounded-full text-forest transition-colors hover:bg-mint/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bright"
              >
                <X className="size-5" aria-hidden />
              </button>
            </div>

            <nav aria-label="Mobile" className="flex-1 overflow-y-auto px-6 pb-10 pt-2">
              <ul>
                {mobileLinks.map((link, index) => (
                  <motion.li
                    key={link.href + link.label}
                    initial={{ opacity: 0, y: reduce ? 0 : 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{
                      duration: 0.4,
                      ease: EASE,
                      delay: reduce ? 0 : 0.1 + index * (STAGGER / 2),
                    }}
                  >
                    <Link
                      href={link.href}
                      onClick={closeMobile}
                      className="block border-b border-edge py-4 font-display text-[1.375rem] font-medium tracking-[-0.02em] text-forest focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bright"
                    >
                      {link.label}
                    </Link>
                  </motion.li>
                ))}
              </ul>

              <div className="mt-8 flex flex-col gap-3">
                <Button href={SITE.primaryCta.href} size="lg" className="w-full">
                  {SITE.primaryCta.label}
                </Button>
                <Button href={SITE.loginHref} variant="secondary" size="lg" className="w-full">
                  Log in
                </Button>
              </div>
            </nav>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </header>
  );
}
