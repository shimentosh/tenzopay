import { useReducedMotion, type Variants } from 'framer-motion';

/**
 * Motion primitives for the guest side.
 *
 * One easing curve, three durations, two travel distances. Everything on the
 * landing page reveals through these so the whole page moves with one voice:
 * slow, confident, one thing at a time. Nothing bounces.
 */
export const EASE: [number, number, number, number] = [0.22, 1, 0.36, 1];
export const EASE_CSS = 'cubic-bezier(0.22, 1, 0.36, 1)';

export const DURATION = {
  hover: 0.25,
  base: 0.6,
  /** Large hero and canvas elements only. */
  slow: 0.9,
} as const;

/** Siblings step 0.08s apart, and never more than six of them. */
export const STAGGER = 0.08;

export const VIEWPORT = { once: true, margin: '-12% 0px -12% 0px' } as const;

/** Cursor-driven card tilt. Critically damped enough to never wobble. */
export const TILT_SPRING = { stiffness: 120, damping: 20 } as const;

/** `useReducedMotion` can report null before the media query is read. */
export function useReducedMotionSafe(): boolean {
  return useReducedMotion() ?? false;
}

export function fadeUp(y = 24, duration: number = DURATION.base, reduce = false): Variants {
  return {
    hidden: { opacity: 0, y: reduce ? 0 : y },
    show: {
      opacity: 1,
      y: 0,
      transition: { duration: reduce ? 0.2 : duration, ease: EASE },
    },
  };
}

/** Scale reveals are for visual panels only — never for text. */
export function riseIn(y = 40, duration: number = DURATION.slow, reduce = false): Variants {
  return {
    hidden: { opacity: 0, y: reduce ? 0 : y, scale: reduce ? 1 : 0.96 },
    show: {
      opacity: 1,
      y: 0,
      scale: 1,
      transition: { duration: reduce ? 0.2 : duration, ease: EASE },
    },
  };
}

export function staggerParent(stagger: number = STAGGER, delayChildren = 0): Variants {
  return {
    hidden: {},
    show: { transition: { staggerChildren: stagger, delayChildren } },
  };
}

/** Props to spread onto any `motion` element that should reveal on scroll. */
export function useReveal(options: { y?: number; scale?: boolean; duration?: number } = {}) {
  const reduce = useReducedMotionSafe();
  const variants = options.scale
    ? riseIn(options.y ?? 40, options.duration ?? DURATION.slow, reduce)
    : fadeUp(options.y ?? 24, options.duration ?? DURATION.base, reduce);

  return {
    initial: 'hidden' as const,
    whileInView: 'show' as const,
    viewport: VIEWPORT,
    variants,
  };
}
