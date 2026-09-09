import Link from 'next/link';
import { Coins, Globe } from 'lucide-react';
import { SITE } from '@/lib/marketing';
import { BrandWordmark } from '@/components/marketing/ui/wordmarks';

const columns = [
  {
    title: 'Product',
    links: [
      { label: 'Virtual cards', href: '/virtual-cards' },
      { label: 'Features', href: '/features' },
      { label: 'Card designs', href: '/#cards' },
      { label: 'Spend controls', href: '/#controls' },
      { label: 'Pricing', href: '/pricing' },
    ],
  },
  {
    title: 'Money',
    links: [
      { label: 'One balance', href: '/#preview' },
      { label: 'Deposits', href: '/how-it-works' },
      { label: 'Transactions', href: '/#preview' },
      { label: 'Limits', href: '/#controls' },
      { label: 'The ledger', href: '/#build' },
    ],
  },
  {
    title: 'Use cases',
    links: [
      { label: 'Freelancers', href: '/#use-cases' },
      { label: 'Advertisers', href: '/#use-cases' },
      { label: 'Subscriptions', href: '/#use-cases' },
      { label: 'Teams', href: '/#use-cases' },
      { label: 'How it works', href: '/how-it-works' },
    ],
  },
  {
    title: 'Company',
    links: [
      { label: 'Security', href: '/security' },
      { label: 'FAQ', href: '/faq' },
      { label: 'Under the hood', href: '/#build' },
      { label: 'Log in', href: '/login' },
      { label: 'Get started', href: '/signup' },
    ],
  },
  {
    title: 'Straight talk',
    links: [
      { label: 'What this build is', href: '/faq' },
      { label: 'Not a bank', href: '/faq' },
      { label: 'Sandbox deposits', href: '/faq' },
      { label: 'Security model', href: '/security' },
      { label: 'Source on GitHub', href: 'https://github.com/shimentosh/tenzopay' },
    ],
  },
];

export function Footer() {
  return (
    <footer className="bg-ink py-16 text-paper/60 md:py-20">
      <div className="mx-auto w-full max-w-container px-6 md:px-8">
        <div className="grid gap-12 lg:grid-cols-[1.1fr_2.4fr]">
          <div>
            <span className="text-paper">
              <BrandWordmark />
            </span>
            <p className="mt-6 max-w-xs text-[0.875rem] leading-relaxed">
              {SITE.tagline} Hold one balance and issue as many virtual cards as you need, each with
              its own limits.
            </p>
            <Link
              href="https://github.com/shimentosh/tenzopay"
              className="mt-6 inline-flex items-center gap-2 rounded-full border border-paper/20 px-4 py-2 text-[0.8125rem] text-paper/80 transition-colors hover:bg-paper/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bright"
            >
              Read the source
            </Link>
          </div>

          <nav aria-label="Footer" className="grid grid-cols-2 gap-8 sm:grid-cols-3 lg:grid-cols-5">
            {columns.map((column) => (
              <div key={column.title}>
                <p className="text-micro font-medium uppercase text-paper/55">{column.title}</p>
                <ul className="mt-5 space-y-3">
                  {column.links.map((link) => (
                    <li key={column.title + link.label}>
                      <Link
                        href={link.href}
                        className="rounded text-[0.875rem] transition-colors hover:text-paper focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bright"
                      >
                        {link.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </nav>
        </div>

        <div className="mt-16 flex flex-col gap-6 border-t border-paper/10 pt-8 lg:flex-row lg:items-center lg:justify-between">
          <p className="max-w-2xl text-[0.75rem] leading-relaxed text-paper/50">
            © {new Date().getFullYear()} {SITE.brand}. A preview built on sandbox infrastructure.
            Not a bank and not a licensed money transmitter; no customer funds are held and deposits
            in this build are simulated.
          </p>

          <div className="flex shrink-0 gap-2">
            <span className="inline-flex items-center gap-2 rounded-full border border-paper/20 px-3.5 py-1.5 text-[0.75rem] text-paper/70">
              <Globe className="size-3.5" aria-hidden />
              English
            </span>
            <span className="inline-flex items-center gap-2 rounded-full border border-paper/20 px-3.5 py-1.5 text-[0.75rem] text-paper/70">
              <Coins className="size-3.5" aria-hidden />
              USDT
            </span>
          </div>
        </div>
      </div>
    </footer>
  );
}
