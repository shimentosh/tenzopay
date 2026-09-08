'use client';

import { motion } from 'framer-motion';
import { CreditCard, Snowflake, Wallet } from 'lucide-react';
import { DURATION, EASE, useReducedMotionSafe } from '@/lib/motion';
import { SITE } from '@/lib/marketing';
import { Button } from '@/components/marketing/ui/button';
import { Pill } from '@/components/marketing/ui/pill';
import { CardMockup } from '@/components/marketing/ui/card-mockup';

/** Thin line-art that draws itself once, behind the hero. */
function LineArt({ reduce }: { reduce: boolean }) {
  const paths = [
    'M-40 210C120 90 300 300 470 150C640 0 820 220 1000 120',
    'M-40 320C140 220 320 400 500 260C680 120 860 330 1000 240',
    'M-40 96C160 40 260 190 460 60C660 -70 840 130 1000 40',
  ];

  return (
    <svg
      aria-hidden
      viewBox="0 0 960 400"
      preserveAspectRatio="none"
      className="pointer-events-none absolute inset-x-0 top-0 h-[34rem] w-full text-bright/40"
    >
      {paths.map((d, index) => (
        <motion.path
          key={d}
          d={d}
          fill="none"
          stroke="currentColor"
          strokeWidth="1.25"
          initial={{ pathLength: reduce ? 1 : 0, opacity: 0 }}
          animate={{ pathLength: 1, opacity: 1 }}
          transition={{ duration: reduce ? 0.3 : 1.8, ease: EASE, delay: reduce ? 0 : index * 0.12 }}
        />
      ))}
    </svg>
  );
}

const stackCards = [
  { tone: 'forest' as const, last4: '1179', holder: 'SUBSCRIPTIONS', expiry: '04/31', rotate: -8, x: '-9%', y: '4%' },
  { tone: 'ink' as const, last4: '6034', holder: 'TRAVEL', expiry: '11/29', rotate: 8, x: '9%', y: '2%' },
];

export function Hero() {
  const reduce = useReducedMotionSafe();
  const rise = (delay: number) => ({
    initial: { opacity: 0, y: reduce ? 0 : 24 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: reduce ? 0.2 : DURATION.base, ease: EASE, delay: reduce ? 0 : delay },
  });

  return (
    <section aria-labelledby="hero-heading" className="relative overflow-hidden bg-paper pb-24 pt-[8.5rem] md:pb-32 md:pt-[10rem]">
      <LineArt reduce={reduce} />

      <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -left-24 top-10 size-[22rem] rounded-full bg-mint/50 blur-3xl motion-safe:animate-drift-slow" />
        <div
          className="absolute -right-20 top-40 size-[26rem] rounded-full bg-bright/25 blur-3xl motion-safe:animate-drift-slow"
          style={{ animationDelay: '1.4s' }}
        />
        <div
          className="absolute bottom-0 left-1/3 size-[18rem] rounded-full bg-coral/25 blur-3xl motion-safe:animate-drift-slow"
          style={{ animationDelay: '2.8s' }}
        />
      </div>

      <div className="relative mx-auto grid w-full max-w-container items-center gap-16 px-6 md:px-8 lg:grid-cols-[1.05fr_1fr] lg:gap-8">
        <div>
          <motion.div {...rise(0)}>
            <Pill tone="mint">Virtual cards · one shared balance</Pill>
          </motion.div>

          <motion.h1
            id="hero-heading"
            {...rise(0.08)}
            className="mt-7 max-w-[15ch] font-display text-h1 font-medium text-forest"
          >
            Spend anywhere. Control everything.
          </motion.h1>

          <motion.p {...rise(0.16)} className="mt-7 max-w-xl text-body-lg text-moss">
            Issue a virtual Visa in seconds and give it its own daily, monthly and per-transaction
            limit. Every card spends from the same balance, and every authorization is checked
            against that balance before it is approved.
          </motion.p>

          <motion.div {...rise(0.24)} className="mt-9 flex flex-wrap gap-3">
            <Button href={SITE.primaryCta.href} size="lg">
              {SITE.primaryCta.label}
            </Button>
            <Button href={SITE.secondaryCta.href} variant="secondary" size="lg">
              {SITE.secondaryCta.label}
            </Button>
          </motion.div>

          <motion.div {...rise(0.32)} className="mt-10 flex flex-wrap items-center gap-x-5 gap-y-4">
            <span aria-hidden className="flex -space-x-2.5">
              {[Wallet, CreditCard, Snowflake].map((Icon, index) => (
                <span
                  key={index}
                  className="inline-flex size-9 items-center justify-center rounded-full border-2 border-paper bg-mint text-forest"
                >
                  <Icon className="size-4" />
                </span>
              ))}
              <span className="inline-flex size-9 items-center justify-center rounded-full border-2 border-paper bg-forest text-[0.6875rem] font-medium text-paper">
                +9
              </span>
            </span>
            <p className="max-w-xs text-[0.8125rem] leading-snug text-moss">
              One balance, as many cards as you need. No card is ever topped up on its own.
            </p>
          </motion.div>
        </div>

        <div className="relative">
          <div className="relative mx-auto w-full max-w-[26rem]">
            {stackCards.map((card, index) => (
              <motion.div
                key={card.last4}
                aria-hidden
                className="absolute inset-0"
                initial={{ opacity: 0, rotate: 0, x: 0, y: 0 }}
                animate={{
                  opacity: 1,
                  rotate: reduce ? 0 : card.rotate,
                  x: reduce ? 0 : card.x,
                  y: reduce ? 0 : card.y,
                }}
                transition={{
                  duration: reduce ? 0.2 : DURATION.slow,
                  ease: EASE,
                  delay: reduce ? 0 : 0.1 + index * 0.1,
                }}
              >
                <CardMockup tone={card.tone} last4={card.last4} holder={card.holder} expiry={card.expiry} />
              </motion.div>
            ))}

            <motion.div
              className="relative"
              initial={{ opacity: 0, y: reduce ? 0 : 24, scale: reduce ? 1 : 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ duration: reduce ? 0.2 : DURATION.slow, ease: EASE, delay: reduce ? 0 : 0.3 }}
            >
              <CardMockup tone="bright" last4="5528" holder="GOOGLE ADS" expiry="09/29" tilt className="shadow-float" />
            </motion.div>
          </div>

          <motion.p {...rise(0.5)} className="mt-8 text-center text-[0.8125rem] text-moss">
            Card faces are illustrative. The full number is only ever drawn by the issuer, in your
            browser.
          </motion.p>
        </div>
      </div>
    </section>
  );
}
