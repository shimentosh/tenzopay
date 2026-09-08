'use client';

import { cn } from '@/lib/utils';
import { useReducedMotionSafe } from '@/lib/motion';

/**
 * Seamless infinite marquee.
 *
 * The track holds the same children twice and travels exactly -50%, so the
 * loop point is invisible. Each half carries its own trailing gap (`pr-*`
 * matching `gap-*`) — without it the two halves are separated by one extra
 * gap and the loop visibly jumps.
 */
export function Marquee({
  children,
  reverse = false,
  duration = 40,
  gap = 'lg',
  className,
}: {
  children: React.ReactNode;
  reverse?: boolean;
  duration?: number;
  gap?: 'sm' | 'lg';
  className?: string;
}) {
  const reduce = useReducedMotionSafe();
  const half = gap === 'sm' ? 'flex shrink-0 items-stretch gap-6 pr-6' : 'flex shrink-0 items-center gap-10 pr-10';

  if (reduce) {
    return (
      <div className={cn('flex flex-wrap items-center justify-center gap-6', className)}>{children}</div>
    );
  }

  return (
    <div
      className={cn(
        'group relative overflow-hidden',
        '[mask-image:linear-gradient(to_right,transparent,black_8%,black_92%,transparent)]',
        '[-webkit-mask-image:linear-gradient(to_right,transparent,black_8%,black_92%,transparent)]',
        className,
      )}
    >
      <div
        className={cn(
          'flex w-max',
          reverse ? 'animate-marquee-x-reverse' : 'animate-marquee-x',
          'group-hover:[animation-play-state:paused]',
        )}
        style={{ animationDuration: `${duration}s` }}
      >
        <div className={half}>{children}</div>
        <div className={half} aria-hidden>
          {children}
        </div>
      </div>
    </div>
  );
}
