'use client';

import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { DURATION, STAGGER, VIEWPORT, fadeUp, riseIn, staggerParent, useReducedMotionSafe } from '@/lib/motion';

/**
 * Reveal order inside a section is always eyebrow → heading → body → CTA →
 * visual, expressed as increasing `delay` on each Reveal.
 */
export function Reveal({
  children,
  className,
  delay = 0,
  y,
  scale = false,
  duration,
}: {
  children: React.ReactNode;
  className?: string;
  delay?: number;
  y?: number;
  scale?: boolean;
  duration?: number;
}) {
  const reduce = useReducedMotionSafe();
  const variants = scale
    ? riseIn(y ?? 40, duration ?? DURATION.slow, reduce)
    : fadeUp(y ?? 24, duration ?? DURATION.base, reduce);

  return (
    <motion.div
      className={className}
      initial="hidden"
      whileInView="show"
      viewport={VIEWPORT}
      variants={variants}
      transition={{ delay: reduce ? 0 : delay }}
    >
      {children}
    </motion.div>
  );
}

/** Parent for a list of siblings. Cap the staggered run at six items. */
export function RevealGroup({
  children,
  className,
  stagger = STAGGER,
  delayChildren = 0,
}: {
  children: React.ReactNode;
  className?: string;
  stagger?: number;
  delayChildren?: number;
}) {
  const reduce = useReducedMotionSafe();

  return (
    <motion.div
      className={className}
      initial="hidden"
      whileInView="show"
      viewport={VIEWPORT}
      variants={staggerParent(reduce ? 0 : stagger, reduce ? 0 : delayChildren)}
    >
      {children}
    </motion.div>
  );
}

export function RevealItem({
  children,
  className,
  y,
  scale = false,
}: {
  children: React.ReactNode;
  className?: string;
  y?: number;
  scale?: boolean;
}) {
  const reduce = useReducedMotionSafe();
  const variants = scale ? riseIn(y ?? 40, DURATION.base, reduce) : fadeUp(y ?? 24, DURATION.base, reduce);

  return (
    <motion.div className={cn(className)} variants={variants}>
      {children}
    </motion.div>
  );
}
