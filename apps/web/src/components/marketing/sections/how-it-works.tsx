'use client';

import { useRef } from 'react';
import { motion, useScroll, useSpring } from 'framer-motion';
import { Pill } from '@/components/marketing/ui/pill';
import { Reveal } from '@/components/marketing/ui/reveal';
import { useReducedMotionSafe } from '@/lib/motion';

function AccountArt() {
  return (
    <svg viewBox="0 0 88 64" className="h-16 w-24 text-forest" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
      <rect x="0.75" y="0.75" width="86.5" height="62.5" rx="10" strokeOpacity="0.25" />
      <path d="M14 20h34M14 32h60M14 44h26" strokeOpacity="0.4" />
      <circle cx="66" cy="20" r="7" />
      <path d="M63 20.5l2.2 2.2L70 18" />
    </svg>
  );
}

function DepositArt() {
  return (
    <svg viewBox="0 0 88 64" className="h-16 w-24 text-forest" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
      <rect x="0.75" y="0.75" width="86.5" height="62.5" rx="10" strokeOpacity="0.25" />
      <path d="M44 12v24M36 29l8 8 8-8" />
      <path d="M20 46h48" strokeOpacity="0.4" />
      <circle cx="44" cy="52" r="3" strokeOpacity="0.4" />
    </svg>
  );
}

function SpendArt() {
  return (
    <svg viewBox="0 0 88 64" className="h-16 w-24 text-forest" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
      <rect x="0.75" y="0.75" width="86.5" height="62.5" rx="10" strokeOpacity="0.25" />
      <rect x="14" y="16" width="46" height="30" rx="6" />
      <path d="M14 26h46" strokeOpacity="0.5" />
      <path d="M22 38h12" strokeOpacity="0.5" />
      <circle cx="66" cy="42" r="9" />
      <path d="M62 42.5l2.8 2.8L70 39" />
    </svg>
  );
}

const steps = [
  {
    number: '01',
    title: 'Create your account',
    body: 'Email, a password and a verification code. Two minutes, and no paperwork to post.',
    art: AccountArt,
  },
  {
    number: '02',
    title: 'Deposit USDT',
    body: 'Send to the address shown for your network. It lands once the chain has enough confirmations behind it.',
    art: DepositArt,
  },
  {
    number: '03',
    title: 'Issue and spend',
    body: 'Create a card, set its ceilings and use it. Freeze it the moment you want it to stop.',
    art: SpendArt,
  },
];

export function HowItWorks() {
  const ref = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotionSafe();
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start 0.85', 'center 0.55'] });
  const pathLength = useSpring(scrollYProgress, { stiffness: 90, damping: 24, restDelta: 0.001 });

  return (
    <section aria-labelledby="how-heading" className="bg-paper py-24 md:py-32">
      <div className="mx-auto w-full max-w-container px-6 md:px-8">
        <div className="max-w-2xl">
          <Reveal>
            <Pill tone="mint">How it works</Pill>
          </Reveal>
          <Reveal delay={0.08}>
            <h2 id="how-heading" className="mt-6 font-display text-h2 font-medium text-forest">
              Three steps, then you are spending.
            </h2>
          </Reveal>
        </div>

        <div ref={ref} className="relative mt-16">
          <svg
            aria-hidden
            viewBox="0 0 1000 2"
            preserveAspectRatio="none"
            className="pointer-events-none absolute left-0 top-7 hidden h-0.5 w-full md:block"
          >
            <motion.path
              d="M0 1H1000"
              stroke="currentColor"
              strokeWidth="2"
              className="text-bright"
              style={{ pathLength: reduce ? 1 : pathLength }}
            />
          </svg>

          <ol className="relative grid gap-12 md:grid-cols-3 md:gap-8">
            {steps.map((step, index) => (
              <li key={step.number}>
                <Reveal delay={index * 0.08}>
                  <span className="inline-flex size-14 items-center justify-center rounded-full bg-bright font-display text-[1.125rem] font-medium text-paper">
                    {step.number}
                  </span>
                  <h3 className="mt-7 font-display text-h3 font-medium text-forest">{step.title}</h3>
                  <p className="mt-4 max-w-sm text-body-base text-moss">{step.body}</p>
                  <div className="mt-7">
                    <step.art />
                  </div>
                </Reveal>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </section>
  );
}
