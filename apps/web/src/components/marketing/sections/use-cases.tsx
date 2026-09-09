'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowRight, Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { EASE, useReducedMotionSafe } from '@/lib/motion';
import { Pill } from '@/components/marketing/ui/pill';
import { Reveal } from '@/components/marketing/ui/reveal';
import { CardMockup, type CardTone } from '@/components/marketing/ui/card-mockup';

type UseCase = {
  id: string;
  tab: string;
  title: string;
  bullets: string[];
  link: { label: string; href: string };
  card: { tone: CardTone; last4: string; holder: string; expiry: string };
  meta: { label: string; value: string }[];
};

const useCases: UseCase[] = [
  {
    id: 'freelancers',
    tab: 'Freelancers',
    title: 'Keep a client’s spend on its own card',
    bullets: [
      'One card per client, so the statement is already itemised',
      'Cap a card at the budget you quoted and stop guessing',
      'Freeze it the day the project ends, keep the history',
    ],
    link: { label: 'See what a card can do', href: '/virtual-cards' },
    card: { tone: 'bright', last4: '4821', holder: 'CLIENT · ACME', expiry: '06/30' },
    meta: [
      { label: 'Monthly ceiling', value: '600.00' },
      { label: 'Spent this month', value: '214.00' },
    ],
  },
  {
    id: 'advertisers',
    tab: 'Advertisers',
    title: 'One card per ad account, capped',
    bullets: [
      'A runaway campaign stops at the card limit, not at your balance',
      'Every platform is a separate line in the feed',
      'Rotate a card without touching the others',
    ],
    link: { label: 'How limits are checked', href: '/how-it-works' },
    card: { tone: 'ink', last4: '5528', holder: 'GOOGLE ADS', expiry: '09/29' },
    meta: [
      { label: 'Daily ceiling', value: '750.00' },
      { label: 'Spent today', value: '184.00' },
    ],
  },
  {
    id: 'subscriptions',
    tab: 'Subscriptions',
    title: 'Cancel by freezing, not by emailing',
    bullets: [
      'A card per subscription makes the renewal obvious',
      'Freeze it and the next renewal is declined at the network',
      'Refunds land back on the same card and the same balance',
    ],
    link: { label: 'Read the FAQ', href: '/faq' },
    card: { tone: 'coral', last4: '1179', holder: 'SUBSCRIPTIONS', expiry: '04/31' },
    meta: [
      { label: 'Renews', value: '1st monthly' },
      { label: 'Per transaction', value: '25.00' },
    ],
  },
  {
    id: 'teams',
    tab: 'Teams',
    title: 'Limits instead of expense claims',
    bullets: [
      'Give a card its ceiling up front rather than approving receipts later',
      'Every authorization is attributed to a card, not a person’s memory',
      'Corrections are posted with a reason and stay in the record',
    ],
    link: { label: 'See pricing', href: '/pricing' },
    card: { tone: 'forest', last4: '6034', holder: 'TEAM · TRAVEL', expiry: '11/29' },
    meta: [
      { label: 'Monthly ceiling', value: '2,000.00' },
      { label: 'On hold', value: '310.00' },
    ],
  },
];

export function UseCases() {
  const [active, setActive] = useState(0);
  const [interacted, setInteracted] = useState(false);
  const reduce = useReducedMotionSafe();
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);

  useEffect(() => {
    if (interacted || reduce) return;
    const timer = window.setInterval(() => setActive((current) => (current + 1) % useCases.length), 6000);
    return () => window.clearInterval(timer);
  }, [interacted, reduce]);

  function select(index: number) {
    setInteracted(true);
    setActive(index);
  }

  function onKeyDown(event: React.KeyboardEvent) {
    if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return;
    event.preventDefault();
    const next =
      event.key === 'ArrowRight'
        ? (active + 1) % useCases.length
        : (active - 1 + useCases.length) % useCases.length;
    select(next);
    tabRefs.current[next]?.focus();
  }

  const current = useCases[active];

  return (
    <section id="use-cases" aria-labelledby="use-cases-heading" className="scroll-mt-24 bg-paper py-24 md:py-32">
      <div className="mx-auto w-full max-w-container px-6 md:px-8">
        <div className="max-w-2xl">
          <Reveal>
            <Pill tone="mint">Who it is for</Pill>
          </Reveal>
          <Reveal delay={0.08}>
            <h2 id="use-cases-heading" className="mt-6 font-display text-h2 font-medium text-forest">
              Four ways people split a balance.
            </h2>
          </Reveal>
        </div>

        <Reveal delay={0.16} className="mt-10">
          <div
            role="tablist"
            aria-label="Use cases"
            onKeyDown={onKeyDown}
            className="inline-flex max-w-full flex-wrap gap-1 rounded-full border border-edge bg-bone p-1.5"
          >
            {useCases.map((useCase, index) => (
              <button
                key={useCase.id}
                ref={(node) => {
                  tabRefs.current[index] = node;
                }}
                role="tab"
                type="button"
                id={`tab-${useCase.id}`}
                aria-selected={active === index}
                aria-controls={`panel-${useCase.id}`}
                tabIndex={active === index ? 0 : -1}
                onClick={() => select(index)}
                className="relative rounded-full px-5 py-2.5 text-[0.9375rem] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bright"
              >
                {active === index ? (
                  <motion.span
                    layoutId="use-case-pill"
                    className="absolute inset-0 rounded-full bg-forest"
                    transition={{ duration: reduce ? 0 : 0.4, ease: EASE }}
                  />
                ) : null}
                <span className={cn('relative', active === index ? 'text-paper' : 'text-moss')}>
                  {useCase.tab}
                </span>
              </button>
            ))}
          </div>
        </Reveal>

        <Reveal delay={0.24} scale className="mt-10">
          <div className="rounded-4xl border border-edge bg-bone p-8 md:p-12">
            <AnimatePresence mode="wait">
              <motion.div
                key={current.id}
                id={`panel-${current.id}`}
                role="tabpanel"
                aria-labelledby={`tab-${current.id}`}
                initial={{ opacity: 0, y: reduce ? 0 : 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: reduce ? 0 : -12 }}
                transition={{ duration: reduce ? 0.2 : 0.4, ease: EASE }}
                className="grid items-center gap-12 lg:grid-cols-[1.1fr_1fr]"
              >
                <div>
                  <h3 className="max-w-[18ch] font-display text-h3 font-medium text-forest">
                    {current.title}
                  </h3>
                  <ul className="mt-7 space-y-4">
                    {current.bullets.map((bullet) => (
                      <li key={bullet} className="flex items-start gap-3">
                        <span className="mt-0.5 inline-flex size-5 shrink-0 items-center justify-center rounded-full bg-bright text-paper">
                          <Check className="size-3" aria-hidden />
                        </span>
                        <span className="text-body-base text-moss">{bullet}</span>
                      </li>
                    ))}
                  </ul>
                  <Link
                    href={current.link.href}
                    className="mt-8 inline-flex items-center gap-2 rounded-full text-[0.9375rem] font-medium text-forest underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bright"
                  >
                    {current.link.label}
                    <ArrowRight className="size-4" aria-hidden />
                  </Link>
                </div>

                <div className="space-y-4">
                  <CardMockup
                    tone={current.card.tone}
                    last4={current.card.last4}
                    holder={current.card.holder}
                    expiry={current.card.expiry}
                    className="shadow-float"
                  />
                  <div className="grid grid-cols-2 gap-3">
                    {current.meta.map((item) => (
                      <div key={item.label} className="rounded-3xl border border-edge bg-paper p-4">
                        <p className="text-[0.75rem] text-moss">{item.label}</p>
                        <p className="mt-1 font-mono text-[0.9375rem] text-forest">{item.value}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </motion.div>
            </AnimatePresence>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
