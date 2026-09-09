'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { DURATION, useReducedMotionSafe } from '@/lib/motion';

type Variant = 'primary' | 'secondary' | 'dark' | 'light' | 'outline';
type Size = 'md' | 'lg';

const MotionLink = motion.create(Link);

const base =
  'inline-flex items-center justify-center gap-2 rounded-full font-medium tracking-[-0.01em] ' +
  'transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bright ' +
  'focus-visible:ring-offset-2 focus-visible:ring-offset-transparent ' +
  'disabled:cursor-not-allowed disabled:opacity-60';

const variants: Record<Variant, string> = {
  primary: 'bg-bright text-paper hover:bg-brightDeep',
  secondary: 'border border-edge bg-paper text-forest hover:bg-bone',
  dark: 'bg-forest text-paper hover:bg-ink',
  light: 'bg-paper text-forest hover:bg-mint',
  outline: 'border border-paper/25 text-paper hover:bg-paper/10',
};

const sizes: Record<Size, string> = {
  md: 'h-12 px-6 text-[0.9375rem]',
  lg: 'h-14 px-8 text-body-lg',
};

type Props = {
  children: React.ReactNode;
  href?: string;
  onClick?: () => void;
  variant?: Variant;
  size?: Size;
  className?: string;
  type?: 'button' | 'submit';
  ariaLabel?: string;
  /** Money actions must disable and announce themselves while in flight. */
  loading?: boolean;
  disabled?: boolean;
};

export function Button({
  children,
  href,
  onClick,
  variant = 'primary',
  size = 'md',
  className,
  type = 'button',
  ariaLabel,
  loading = false,
  disabled = false,
}: Props) {
  const reduce = useReducedMotionSafe();
  const inert = loading || disabled;
  const classes = cn(base, variants[variant], sizes[size], className);
  const motionProps =
    reduce || inert
      ? {}
      : {
          whileHover: { scale: 1.02 },
          whileTap: { scale: 0.98 },
          transition: { duration: DURATION.hover },
        };

  if (href) {
    return (
      <MotionLink href={href} className={classes} aria-label={ariaLabel} {...motionProps}>
        {children}
      </MotionLink>
    );
  }

  return (
    <motion.button
      type={type}
      onClick={onClick}
      className={classes}
      aria-label={ariaLabel}
      aria-busy={loading || undefined}
      disabled={inert}
      {...motionProps}
    >
      {loading ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
      {children}
    </motion.button>
  );
}
