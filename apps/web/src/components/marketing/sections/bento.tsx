'use client';

import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Bell, Eye, ShieldCheck, Snowflake } from 'lucide-react';
import { cn } from '@/lib/utils';
import { EASE, VIEWPORT, useReducedMotionSafe } from '@/lib/motion';
import { Pill } from '@/components/marketing/ui/pill';
import { Reveal } from '@/components/marketing/ui/reveal';
import { PhoneFrame } from '@/components/marketing/ui/phone-frame';
import { CardMockup } from '@/components/marketing/ui/card-mockup';

const cardList = [
  { name: 'CLAUDE CODE', limit: '20.00 / mo', tone: 'bg-bright' },
  { name: 'FACEBOOK ADS', limit: '500.00 / mo', tone: 'bg-forest' },
  { name: 'NETFLIX SUB', limit: '15.99 / mo', tone: 'bg-coral' },
  { name: 'GOOGLE ADS', limit: '750.00 / mo', tone: 'bg-ink' },
  { name: 'TIKTOK ADS', limit: '300.00 / mo', tone: 'bg-bright' },
  { name: 'SHOPIFY', limit: '79.00 / mo', tone: 'bg-forest' },
];

const notifications = [
  { title: 'Your code is 448 219', body: '3-D Secure · Google Ads · do not share it', icon: ShieldCheck },
  { title: 'Netflix renewed', body: '15.99 USDT · Subscriptions · 1179', icon: Bell },
  { title: 'Refund received', body: '12.00 USDT back from Figma', icon: Bell },
  { title: 'Daily limit reached', body: 'Google Ads · 5528 · further spend declined', icon: ShieldCheck },
];

function CardListTile() {
  const reduce = useReducedMotionSafe();

  return (
    <div className="flex h-full flex-col justify-between gap-8 md:flex-row md:items-center">
      <div className="max-w-sm">
        <h3 className="font-display text-h3 font-medium text-forest">Issue cards in seconds</h3>
        <p className="mt-4 text-body-base text-moss">
          One card per merchant means one line to cancel when you stop paying for something. Every
          card here draws on the same balance.
        </p>
        <span className="mt-6 inline-flex items-center gap-2 rounded-full bg-ink px-4 py-2.5 text-[0.8125rem] font-medium text-paper">
          <Eye className="size-4" aria-hidden />
          Reveal details
        </span>
      </div>

      <PhoneFrame className="max-w-[15rem] shrink-0">
        <div className="h-[19rem] overflow-hidden px-3 py-4">
          <p className="px-2 pb-3 text-[0.6875rem] font-medium uppercase tracking-[0.12em] text-moss">
            Your cards
          </p>
          <div className={cn('space-y-2', !reduce && 'animate-scroll-y')}>
            {[...cardList, ...cardList].map((card, index) => (
              <div
                key={card.name + index}
                className="flex items-center gap-3 rounded-2xl border border-edge bg-paper p-2.5"
                aria-hidden={index >= cardList.length}
              >
                <span className={cn('h-8 w-11 shrink-0 rounded-md', card.tone)} />
                <span className="min-w-0">
                  <span className="block truncate text-[0.75rem] font-medium text-forest">{card.name}</span>
                  <span className="block text-[0.6875rem] text-moss">{card.limit}</span>
                </span>
              </div>
            ))}
          </div>
        </div>
      </PhoneFrame>
    </div>
  );
}

function NotificationTile() {
  const reduce = useReducedMotionSafe();
  const [stack, setStack] = useState([0]);

  useEffect(() => {
    if (reduce) return;

    let next = 1;
    const timer = window.setInterval(() => {
      setStack((current) => [next % notifications.length, ...current].slice(0, 3));
      next += 1;
    }, 2500);

    return () => window.clearInterval(timer);
  }, [reduce]);

  return (
    <div className="flex h-full flex-col">
      <h3 className="font-display text-h3 font-medium text-forest">Told the moment it happens</h3>
      <p className="mt-4 text-body-base text-moss">
        Authorizations, holds, refunds and declines all arrive as they occur.
      </p>

      <div className="mt-8 flex-1 rounded-3xl bg-forest p-4">
        <p className="pb-3 text-center text-[0.6875rem] uppercase tracking-[0.12em] text-paper/50">
          Sunday, 8 September
        </p>
        <div className="space-y-2">
          <AnimatePresence initial={false}>
            {stack.map((id) => {
              const item = notifications[id];
              return (
                <motion.div
                  key={`${id}-${stack.length}-${item.title}`}
                  layout
                  initial={{ opacity: 0, y: reduce ? 0 : -16 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: reduce ? 0.2 : 0.5, ease: EASE }}
                  className="flex items-start gap-3 rounded-2xl bg-paper/10 p-3 backdrop-blur-sm"
                >
                  <span className="inline-flex size-7 shrink-0 items-center justify-center rounded-lg bg-bright text-paper">
                    <item.icon className="size-3.5" aria-hidden />
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-[0.75rem] font-medium text-paper">{item.title}</span>
                    <span className="block truncate text-[0.6875rem] text-paper/60">{item.body}</span>
                  </span>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}

function FreezeTile() {
  const reduce = useReducedMotionSafe();
  const [frozen, setFrozen] = useState(false);

  useEffect(() => {
    if (reduce) return;
    const timer = window.setInterval(() => setFrozen((value) => !value), 3000);
    return () => window.clearInterval(timer);
  }, [reduce]);

  return (
    <div className="flex h-full flex-col">
      <h3 className="font-display text-h3 font-medium text-forest">Freeze it instantly</h3>
      <p className="mt-4 text-body-base text-moss">
        Freezing reaches the network, so the next attempt is declined at source — not just hidden here.
      </p>

      <div className="mt-8 flex flex-1 flex-col justify-end gap-5">
        <CardMockup tone="forest" last4="1179" holder="SUBSCRIPTIONS" expiry="04/31" frozen={frozen} />

        <div className="flex items-center justify-between rounded-full border border-edge bg-paper px-5 py-3">
          <span className="inline-flex items-center gap-2 text-[0.8125rem] font-medium text-forest">
            <Snowflake className="size-4" aria-hidden />
            {frozen ? 'Frozen' : 'Active'}
          </span>
          <span
            aria-hidden
            className={cn(
              'flex h-6 w-11 items-center rounded-full p-0.5 transition-colors duration-300',
              frozen ? 'bg-forest' : 'bg-bright',
            )}
          >
            <motion.span
              layout
              transition={{ duration: reduce ? 0 : 0.3, ease: EASE }}
              className={cn('size-5 rounded-full bg-paper', frozen ? 'ml-auto' : '')}
            />
          </span>
        </div>
      </div>
    </div>
  );
}

function RingTile() {
  const reduce = useReducedMotionSafe();
  const radius = 52;
  const circumference = 2 * Math.PI * radius;
  const progress = 0.7125;

  return (
    <div className="flex h-full flex-col">
      <h3 className="font-display text-h3 font-medium text-forest">Limits that hold</h3>
      <p className="mt-4 text-body-base text-moss">
        Daily, monthly and per-transaction ceilings, checked before every approval.
      </p>

      <div className="mt-8 flex flex-1 items-center justify-center">
        <div className="relative">
          <svg viewBox="0 0 128 128" className="size-40 -rotate-90" aria-hidden>
            <circle cx="64" cy="64" r={radius} fill="none" stroke="currentColor" strokeWidth="12" className="text-sand" />
            <motion.circle
              cx="64"
              cy="64"
              r={radius}
              fill="none"
              stroke="currentColor"
              strokeWidth="12"
              strokeLinecap="round"
              className="text-bright"
              strokeDasharray={circumference}
              initial={{ strokeDashoffset: reduce ? circumference * (1 - progress) : circumference }}
              whileInView={{ strokeDashoffset: circumference * (1 - progress) }}
              viewport={VIEWPORT}
              transition={{ duration: reduce ? 0.2 : 1.4, ease: EASE }}
            />
          </svg>
          <span className="absolute inset-0 flex flex-col items-center justify-center text-center">
            <span className="font-display text-[1.5rem] font-medium tracking-[-0.02em] text-forest">142.50</span>
            <span className="text-[0.75rem] text-moss">of 200.00 USDT</span>
          </span>
        </div>
      </div>
    </div>
  );
}

export function Bento() {
  return (
    <section aria-labelledby="bento-heading" className="bg-bone py-24 md:py-32">
      <div className="mx-auto w-full max-w-container px-6 md:px-8">
        <div className="max-w-2xl">
          <Reveal>
            <Pill tone="light">Everything in one place</Pill>
          </Reveal>
          <Reveal delay={0.08}>
            <h2 id="bento-heading" className="mt-6 font-display text-h2 font-medium text-forest">
              Made for the way you actually spend.
            </h2>
          </Reveal>
        </div>

        <div className="mt-14 grid gap-6 md:gap-8 lg:grid-cols-3">
          <Reveal scale className="lg:col-span-2">
            <div className="h-full rounded-4xl border border-edge bg-paper p-8 md:p-10">
              <CardListTile />
            </div>
          </Reveal>

          <Reveal scale delay={0.08}>
            <div className="h-full rounded-4xl border border-edge bg-paper p-8">
              <NotificationTile />
            </div>
          </Reveal>

          <Reveal scale delay={0.16}>
            <div className="h-full rounded-4xl border border-edge bg-paper p-8">
              <FreezeTile />
            </div>
          </Reveal>

          <Reveal scale delay={0.24} className="lg:col-span-2">
            <div className="h-full rounded-4xl border border-edge bg-paper p-8 md:p-10">
              <RingTile />
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  );
}
