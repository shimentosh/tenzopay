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
import { Button } from '@/components/marketing/ui/button';
import { PageHero } from '@/components/marketing/ui/page-hero';
import { Reveal, RevealGroup, RevealItem } from '@/components/marketing/ui/reveal';

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
      <PageHero
        eyebrow="Features"
        title="Everything you need to run spending"
        lead="TenzoPay is built around one idea: cards are spending instruments, not separate wallets. Everything else follows from that."
      />

      <div className="mx-auto w-full max-w-container px-6 py-24 md:px-8 md:py-32">
        {groups.map((group, groupIndex) => (
          <section
            key={group.title}
            aria-labelledby={`group-${group.title.toLowerCase()}`}
            className={groupIndex > 0 ? 'mt-20 md:mt-24' : ''}
          >
            <Reveal>
              <h2
                id={`group-${group.title.toLowerCase()}`}
                className="text-micro font-medium uppercase text-moss"
              >
                {group.title}
              </h2>
            </Reveal>

            <RevealGroup className="mt-8 grid gap-6 md:grid-cols-3 md:gap-8" delayChildren={0.08}>
              {group.items.map((item) => (
                <RevealItem key={item.title}>
                  <article className="group h-full rounded-4xl border border-edge bg-paper p-8 transition-colors duration-300 hover:border-bright">
                    <span className="inline-flex size-12 items-center justify-center rounded-full bg-mint text-forest transition-transform duration-300 group-hover:scale-[1.08]">
                      <item.icon className="size-5" aria-hidden />
                    </span>
                    <h3 className="mt-6 font-display text-[1.125rem] font-medium tracking-[-0.02em] text-forest">
                      {item.title}
                    </h3>
                    <p className="mt-3 text-[0.9375rem] leading-relaxed text-moss">{item.body}</p>
                  </article>
                </RevealItem>
              ))}
            </RevealGroup>
          </section>
        ))}

        <Reveal delay={0.1}>
          <div className="mt-20 flex justify-center">
            <Button href="/signup" size="lg">
              Get your card
            </Button>
          </div>
        </Reveal>
      </div>
    </>
  );
}
