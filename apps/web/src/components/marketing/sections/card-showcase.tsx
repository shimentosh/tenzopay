'use client';

import { useRef } from 'react';
import { motion, useScroll, useTransform } from 'framer-motion';
import { Gauge, Snowflake, Zap } from 'lucide-react';
import { useReducedMotionSafe } from '@/lib/motion';
import { Pill } from '@/components/marketing/ui/pill';
import { Reveal } from '@/components/marketing/ui/reveal';
import { CardMockup, type CardTone } from '@/components/marketing/ui/card-mockup';

const designs: { tone: CardTone; name: string; last4: string; holder: string; expiry: string }[] = [
  { tone: 'bright', name: 'Bright', last4: '5528', holder: 'GOOGLE ADS', expiry: '09/29' },
  { tone: 'forest', name: 'Forest', last4: '1179', holder: 'SUBSCRIPTIONS', expiry: '04/31' },
  { tone: 'coral', name: 'Coral', last4: '4821', holder: 'CLIENT · ACME', expiry: '06/30' },
  { tone: 'ink', name: 'Ink', last4: '6034', holder: 'TRAVEL', expiry: '11/29' },
];

const specs = [
  { icon: Zap, label: 'Virtual and usable the second it exists' },
  { icon: Gauge, label: 'Its own daily, monthly and per-transaction ceiling' },
  { icon: Snowflake, label: 'Frozen and unfrozen as often as you like' },
];

export function CardShowcase() {
  const ref = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotionSafe();
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start end', 'end start'] });
  const x = useTransform(scrollYProgress, [0, 1], ['4%', '-26%']);

  return (
    <section id="cards" aria-labelledby="cards-heading" className="scroll-mt-24 overflow-hidden bg-sand py-24 md:py-32">
      <div className="mx-auto w-full max-w-container px-6 md:px-8">
        <div className="max-w-2xl">
          <Reveal>
            <Pill tone="light">Card designs</Pill>
          </Reveal>
          <Reveal delay={0.08}>
            <h2 id="cards-heading" className="mt-6 font-display text-h2 font-medium text-forest">
              Pick a card that looks like you.
            </h2>
          </Reveal>
          <Reveal delay={0.16}>
            <p className="mt-5 max-w-xl text-body-lg text-moss">
              Four faces. The design is yours to choose; everything behind it behaves the same way.
            </p>
          </Reveal>
        </div>
      </div>

      <div ref={ref} className="mt-16">
        <motion.div style={{ x: reduce ? 0 : x }} className="flex gap-6 px-6 md:gap-8 md:px-8">
          {designs.map((design) => (
            <figure key={design.tone} className="w-[17rem] shrink-0 md:w-[22rem]">
              <CardMockup
                tone={design.tone}
                last4={design.last4}
                holder={design.holder}
                expiry={design.expiry}
                className="shadow-float"
              />
              <figcaption className="mt-4 text-[0.8125rem] text-moss">{design.name}</figcaption>
            </figure>
          ))}
        </motion.div>
      </div>

      <div className="mx-auto w-full max-w-container px-6 md:px-8">
        <Reveal delay={0.08} className="mt-16">
          <ul className="grid gap-6 border-t border-edge pt-10 md:grid-cols-3 md:gap-8">
            {specs.map((spec) => (
              <li key={spec.label} className="flex items-start gap-3">
                <span className="mt-0.5 inline-flex size-9 shrink-0 items-center justify-center rounded-full bg-paper text-forest">
                  <spec.icon className="size-4" aria-hidden />
                </span>
                <span className="max-w-[28ch] text-body-base text-moss">{spec.label}</span>
              </li>
            ))}
          </ul>
        </Reveal>
      </div>
    </section>
  );
}
