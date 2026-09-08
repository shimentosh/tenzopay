'use client';

import { motion, useMotionValue, useSpring, useTransform } from 'framer-motion';
import { Snowflake } from 'lucide-react';
import { cn } from '@/lib/utils';
import { TILT_SPRING, useReducedMotionSafe } from '@/lib/motion';

export type CardTone = 'bright' | 'forest' | 'coral' | 'ink';

const tones: Record<CardTone, string> = {
  bright: 'bg-bright text-forest',
  forest: 'bg-forest text-paper',
  coral: 'bg-coral text-forest',
  ink: 'bg-ink text-paper',
};

function Chip({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 40 30" className={cn('h-7 w-9', className)} aria-hidden>
      <rect x="0.75" y="0.75" width="38.5" height="28.5" rx="5" fill="none" stroke="currentColor" strokeOpacity="0.45" />
      <path
        d="M0 10h12M0 20h12M28 10h12M28 20h12M14 0v6M26 0v6M14 24v6M26 24v6"
        stroke="currentColor"
        strokeOpacity="0.35"
      />
      <rect x="12" y="6" width="16" height="18" rx="3" fill="none" stroke="currentColor" strokeOpacity="0.45" />
    </svg>
  );
}

function VisaMark() {
  return (
    <svg viewBox="0 0 60 20" className="h-4 w-[3.75rem]" aria-hidden>
      <text
        x="60"
        y="15"
        textAnchor="end"
        fontFamily="inherit"
        fontSize="17"
        fontWeight="700"
        fontStyle="italic"
        letterSpacing="0.06em"
        fill="currentColor"
      >
        VISA
      </text>
    </svg>
  );
}

/**
 * A card face. Illustrative only — it never renders a full PAN, because the
 * real number is drawn by the issuer's own iframe and never reaches this app.
 */
export function CardMockup({
  tone = 'bright',
  label = 'TenzoPay',
  last4 = '5528',
  holder = 'A. RAHMAN',
  expiry = '09/29',
  frozen = false,
  tilt = false,
  className,
}: {
  tone?: CardTone;
  label?: string;
  last4?: string;
  holder?: string;
  expiry?: string;
  frozen?: boolean;
  tilt?: boolean;
  className?: string;
}) {
  const reduce = useReducedMotionSafe();
  const px = useMotionValue(0);
  const py = useMotionValue(0);
  const sx = useSpring(px, TILT_SPRING);
  const sy = useSpring(py, TILT_SPRING);
  const rotateY = useTransform(sx, [-0.5, 0.5], [-8, 8]);
  const rotateX = useTransform(sy, [-0.5, 0.5], [8, -8]);
  const interactive = tilt && !reduce;

  const face = (
    <div
      className={cn(
        'relative isolate flex aspect-[1.586/1] w-full flex-col justify-between overflow-hidden rounded-3xl p-6',
        tones[tone],
        frozen && 'saturate-[0.15]',
        className,
      )}
    >
      <div aria-hidden className="pointer-events-none absolute -right-20 -top-28 size-64 rounded-full border border-current opacity-15" />
      <div aria-hidden className="pointer-events-none absolute -bottom-32 -left-16 size-72 rounded-full border border-current opacity-10" />

      <div className="flex items-start justify-between">
        <span className="font-display text-[0.9375rem] font-semibold tracking-[-0.02em]">{label}</span>
        <Chip />
      </div>

      <div className="space-y-3">
        <p className="font-mono text-[0.9375rem] tracking-[0.16em] opacity-90">•••• •••• •••• {last4}</p>
        <div className="flex items-end justify-between gap-4">
          <div className="space-y-1">
            <p className="text-[0.625rem] uppercase tracking-[0.12em] opacity-60">Card holder</p>
            <p className="text-[0.8125rem] font-medium uppercase tracking-[0.06em]">{holder}</p>
          </div>
          <div className="space-y-1">
            <p className="text-[0.625rem] uppercase tracking-[0.12em] opacity-60">Valid thru</p>
            <p className="text-[0.8125rem] font-medium tracking-[0.06em]">{expiry}</p>
          </div>
          <VisaMark />
        </div>
      </div>

      {frozen ? (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-paper/25 backdrop-blur-[3px]">
          <span className="inline-flex items-center gap-2 rounded-full bg-forest/80 px-3.5 py-1.5 text-[0.6875rem] font-medium uppercase tracking-[0.12em] text-paper">
            <Snowflake className="size-3.5" aria-hidden />
            Frozen
          </span>
        </div>
      ) : null}
    </div>
  );

  if (!interactive) return face;

  return (
    <div
      style={{ perspective: 1200 }}
      onPointerMove={(event) => {
        const rect = event.currentTarget.getBoundingClientRect();
        px.set((event.clientX - rect.left) / rect.width - 0.5);
        py.set((event.clientY - rect.top) / rect.height - 0.5);
      }}
      onPointerLeave={() => {
        px.set(0);
        py.set(0);
      }}
    >
      <motion.div style={{ rotateX, rotateY, transformStyle: 'preserve-3d' }}>{face}</motion.div>
    </div>
  );
}
