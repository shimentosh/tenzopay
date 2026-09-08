'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { EASE, useReducedMotionSafe } from '@/lib/motion';
import { Button } from '@/components/marketing/ui/button';
import { Counter } from '@/components/marketing/ui/counter';
import { Pill } from '@/components/marketing/ui/pill';
import { Reveal, RevealGroup, RevealItem } from '@/components/marketing/ui/reveal';

type Cadence = 'monthly' | 'yearly';

const tiers = [
  {
    name: 'Starter',
    price: { monthly: 0, yearly: 0 },
    note: 'Free, and it stays free',
    description: 'For getting a handle on your own spending.',
    features: [
      'Up to 3 virtual cards',
      'One USDT balance',
      'Daily and monthly limits per card',
      'Freeze and unfreeze',
      'Full transaction history',
    ],
    cta: 'Get started',
    href: '/signup',
    highlighted: false,
  },
  {
    name: 'Team',
    price: { monthly: 19, yearly: 228 },
    note: 'Billed to the same balance',
    description: 'For running vendors, ads and subscriptions.',
    features: [
      'Up to 20 virtual cards',
      'Per-transaction limits',
      'Spending broken down by card',
      'A notification on every state change',
      'Priority support',
    ],
    cta: 'Get started',
    href: '/signup',
    highlighted: true,
  },
  {
    name: 'Business',
    price: null,
    note: 'Talk to us about volume',
    description: 'For organisations needing higher ceilings.',
    features: [
      'Custom card limits',
      'Dedicated onboarding',
      'Advanced reporting',
      'Role-based team access',
      'Named point of contact',
    ],
    cta: 'Contact sales',
    href: '/pricing',
    highlighted: false,
  },
];

export function Pricing() {
  const [cadence, setCadence] = useState<Cadence>('monthly');
  const reduce = useReducedMotionSafe();

  return (
    <section aria-labelledby="pricing-heading" className="bg-paper py-24 md:py-32">
      <div className="mx-auto w-full max-w-container px-6 md:px-8">
        <div className="mx-auto max-w-2xl text-center">
          <Reveal>
            <Pill tone="mint">Pricing</Pill>
          </Reveal>
          <Reveal delay={0.08}>
            <h2 id="pricing-heading" className="mt-6 font-display text-h2 font-medium text-forest">
              Three plans. No surprises.
            </h2>
          </Reveal>
          <Reveal delay={0.16}>
            <p className="mx-auto mt-5 max-w-xl text-body-lg text-moss">
              Network and blockchain fees, where they apply, are shown before you confirm anything.
            </p>
          </Reveal>

          <Reveal delay={0.24}>
            <div className="mt-9 inline-flex rounded-full border border-edge bg-bone p-1.5">
              {(['monthly', 'yearly'] as Cadence[]).map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => setCadence(option)}
                  aria-pressed={cadence === option}
                  className="relative rounded-full px-6 py-2.5 text-[0.9375rem] capitalize focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bright"
                >
                  {cadence === option ? (
                    <motion.span
                      layoutId="cadence-pill"
                      className="absolute inset-0 rounded-full bg-forest"
                      transition={{ duration: reduce ? 0 : 0.4, ease: EASE }}
                    />
                  ) : null}
                  <span className={cn('relative', cadence === option ? 'text-paper' : 'text-moss')}>
                    {option}
                  </span>
                </button>
              ))}
            </div>
          </Reveal>
        </div>

        <RevealGroup className="mt-14 grid gap-6 lg:grid-cols-3 lg:gap-8" delayChildren={0.1}>
          {tiers.map((tier) => (
            <RevealItem key={tier.name} className={cn(tier.highlighted && 'lg:-mt-2')}>
              <article
                className={cn(
                  'flex h-full flex-col rounded-4xl border bg-paper p-8 md:p-10',
                  tier.highlighted ? 'border-bright shadow-float' : 'border-edge',
                )}
              >
                <div className="flex items-center justify-between gap-4">
                  <h3 className="font-display text-h3 font-medium text-forest">{tier.name}</h3>
                  {tier.highlighted ? <Pill tone="mint">Most popular</Pill> : null}
                </div>

                <p className="mt-5 font-display text-[2.75rem] font-medium leading-none tracking-[-0.02em] text-forest">
                  {tier.price === null ? (
                    'Custom'
                  ) : (
                    <>
                      <Counter value={tier.price[cadence]} prefix="$" duration={0.8} />
                      <span className="text-[1.125rem] font-normal text-moss">
                        {tier.price[cadence] === 0 ? '' : cadence === 'monthly' ? ' / month' : ' / year'}
                      </span>
                    </>
                  )}
                </p>
                <p className="mt-2 text-[0.8125rem] text-moss">{tier.note}</p>
                <p className="mt-5 text-body-base text-moss">{tier.description}</p>

                <ul className="mt-7 flex-1 space-y-3.5">
                  {tier.features.map((feature) => (
                    <li key={feature} className="flex items-start gap-3">
                      <span className="mt-0.5 inline-flex size-5 shrink-0 items-center justify-center rounded-full bg-mint text-forest">
                        <Check className="size-3" aria-hidden />
                      </span>
                      <span className="text-[0.9375rem] text-moss">{feature}</span>
                    </li>
                  ))}
                </ul>

                <div className="mt-9">
                  <Button
                    href={tier.href}
                    variant={tier.highlighted ? 'primary' : 'secondary'}
                    size="lg"
                    className="w-full"
                  >
                    {tier.cta}
                  </Button>
                </div>
              </article>
            </RevealItem>
          ))}
        </RevealGroup>

        <Reveal delay={0.2}>
          <p className="mt-8 text-center text-[0.8125rem] text-moss">
            Yearly is the same price, billed once a year. No discount is implied and none is hidden.
          </p>
        </Reveal>
      </div>
    </section>
  );
}
