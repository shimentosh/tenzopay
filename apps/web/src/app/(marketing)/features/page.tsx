import Link from 'next/link';
import {
  Ban,
  BellRing,
  CreditCard,
  Gauge,
  History,
  Layers,
  LineChart,
  Snowflake,
  Wallet,
} from 'lucide-react';
import { Button } from '@/components/ui/button';

export const metadata = {
  title: 'Features',
  description: 'One balance, many cards, and per-card spending controls.',
};

const groups = [
  {
    title: 'Balance',
    items: [
      {
        icon: Wallet,
        title: 'A single available balance',
        body: 'Deposit USDT once. Every card draws from the same pool, so your true position is always one number.',
      },
      {
        icon: History,
        title: 'Held versus available',
        body: 'Pending authorizations are shown separately, so you always know what is genuinely spendable right now.',
      },
      {
        icon: Layers,
        title: 'Confirmation tracking',
        body: 'Deposits move through detection and network confirmation in view, with the transaction hash and block count.',
      },
    ],
  },
  {
    title: 'Cards',
    items: [
      {
        icon: CreditCard,
        title: 'Virtual cards in seconds',
        body: 'Name a card, set its limits, and use it immediately. Up to twenty open cards per account.',
      },
      {
        icon: Gauge,
        title: 'Per-transaction, daily and monthly limits',
        body: 'Limits are registered with the card issuer and enforced on their infrastructure, not merely displayed in this app.',
      },
      {
        icon: Snowflake,
        title: 'Freeze and unfreeze',
        body: 'Freezing takes effect at the card network immediately. Unfreeze whenever you are ready — nothing is lost.',
      },
    ],
  },
  {
    title: 'Control',
    items: [
      {
        icon: Ban,
        title: 'Declines when funds are short',
        body: 'Every authorization is checked against your shared balance, so several cards cannot together outspend it.',
      },
      {
        icon: LineChart,
        title: 'Spending overview',
        body: 'See today, the last seven days and the last thirty at a glance, per card or across the account.',
      },
      {
        icon: BellRing,
        title: 'Notifications that matter',
        body: 'Deposit detected, deposit confirmed, card created, card frozen. No noise.',
      },
    ],
  },
];

export default function FeaturesPage() {
  return (
    <>
      <section className="border-b border-border bg-card">
        <div className="mx-auto max-w-4xl px-5 py-16 lg:py-20">
          <h1 className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
            Everything you need to run spending
          </h1>
          <p className="mt-4 max-w-2xl text-[17px] leading-relaxed text-muted-foreground">
            TenzoPay is built around one idea: cards are spending instruments,
            not separate wallets. Everything follows from that.
          </p>
        </div>
      </section>

      <div className="mx-auto max-w-5xl px-5 py-16">
        {groups.map((group, index) => (
          <section key={group.title} className={index > 0 ? 'mt-16' : ''}>
            <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {group.title}
            </h2>
            <div className="mt-5 grid gap-6 md:grid-cols-3">
              {group.items.map((item) => (
                <div key={item.title} className="card-surface p-6">
                  <div className="flex size-10 items-center justify-center rounded-xl bg-accent text-primary">
                    <item.icon className="size-5" aria-hidden />
                  </div>
                  <h3 className="mt-4 font-semibold text-foreground">{item.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                    {item.body}
                  </p>
                </div>
              ))}
            </div>
          </section>
        ))}

        <div className="mt-16 text-center">
          <Button asChild size="lg">
            <Link href="/signup">Get started</Link>
          </Button>
        </div>
      </div>
    </>
  );
}
