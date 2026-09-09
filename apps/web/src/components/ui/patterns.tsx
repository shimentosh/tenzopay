import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * The layout patterns this design system is made of.
 *
 * None of these take a shadow, a gradient, or a border used as a separator.
 * Depth is a tint step; emphasis is weight and size. They hold no hooks, so
 * server components can render them directly.
 *
 * See DESIGN.md.
 */

/* ------------------------------------------------------------- Hero metric -- */

export function HeroMetric({
  label,
  amount,
  currency,
  meta,
  controls,
  actions,
}: {
  label: string;
  amount: string;
  currency?: string;
  meta?: React.ReactNode;
  /** Small circular icon buttons that sit beside the amount. */
  controls?: React.ReactNode;
  /** Pill quick-actions. The FIRST one is the accent-filled action. */
  actions?: React.ReactNode;
}) {
  return (
    <section aria-labelledby="hero-metric-label">
      <p id="hero-metric-label" className="text-ui text-content-tertiary">
        {label}
      </p>

      <div className="mt-2 flex flex-wrap items-center gap-3">
        <p className="tnum text-display font-semibold text-content-primary">
          {amount}
          {currency ? (
            <span className="ml-1.5 text-value font-normal text-content-tertiary">{currency}</span>
          ) : null}
        </p>
        {controls ? <div className="flex items-center gap-1">{controls}</div> : null}
      </div>

      {meta ? <div className="mt-2 text-ui text-content-tertiary">{meta}</div> : null}
      {actions ? <div className="mt-6 flex flex-wrap gap-2">{actions}</div> : null}
    </section>
  );
}

/* ---------------------------------------------------------------- Nav item -- */

export function NavItem({
  href,
  label,
  icon: Icon,
  active = false,
  nested = false,
  onClick,
}: {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  active?: boolean;
  nested?: boolean;
  onClick?: () => void;
}) {
  return (
    <Link
      href={href}
      onClick={onClick}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'flex h-11 items-center gap-3 rounded-pill px-3 text-ui outline-none',
        'transition-colors duration-150 ease',
        'focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
        nested && 'ml-7 h-10',
        active
          ? 'bg-surface-raised font-semibold text-content-primary'
          : 'text-content-secondary hover:bg-surface-raised hover:text-content-primary',
      )}
    >
      <Icon className={cn(nested ? 'size-4' : 'size-5', 'shrink-0')} />
      {label}
    </Link>
  );
}

/* ---------------------------------------------------------------- List row -- */

export function ListRow({
  icon,
  title,
  subtitle,
  amount,
  amountTone = 'neutral',
  secondaryAmount,
  href,
  trailing,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle?: string;
  amount?: string;
  /** Incoming money is the only amount that takes colour. */
  amountTone?: 'neutral' | 'positive';
  secondaryAmount?: string;
  href?: string;
  trailing?: React.ReactNode;
}) {
  const body = (
    <>
      <span className="flex size-12 shrink-0 items-center justify-center rounded-full bg-surface-raised text-content-primary">
        {icon}
      </span>

      <span className="min-w-0 flex-1">
        <span className="block truncate text-ui font-semibold text-content-primary">{title}</span>
        {subtitle ? (
          <span className="mt-0.5 block truncate text-ui text-content-tertiary">{subtitle}</span>
        ) : null}
      </span>

      {amount ? (
        <span className="shrink-0 text-right">
          <span
            className={cn(
              'tnum block text-value font-semibold',
              amountTone === 'positive' ? 'text-positive' : 'text-content-primary',
            )}
          >
            {amount}
          </span>
          {secondaryAmount ? (
            <span className="tnum mt-0.5 block text-ui text-content-tertiary">
              {secondaryAmount}
            </span>
          ) : null}
        </span>
      ) : null}

      {trailing}
    </>
  );

  const shared =
    'flex w-full items-center gap-4 rounded-card px-3 py-4 text-left transition-colors duration-150 ease ' +
    'focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background outline-none';

  if (href) {
    return (
      <Link href={href} className={cn(shared, 'hover:bg-surface-raised')}>
        {body}
      </Link>
    );
  }

  return <div className={cn(shared, 'hover:bg-surface-raised')}>{body}</div>;
}

/* ----------------------------------------------------------- Section header -- */

export function SectionHeader({
  title,
  seeAllHref,
  seeAllLabel = 'See all',
}: {
  title: string;
  seeAllHref?: string;
  seeAllLabel?: string;
}) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <h2 className="text-title font-semibold text-content-primary">{title}</h2>
      {seeAllHref ? (
        <Link
          href={seeAllHref}
          className="rounded text-ui text-content-secondary underline underline-offset-4 outline-none transition-colors duration-150 ease hover:text-content-primary focus-visible:ring-2 focus-visible:ring-ring"
        >
          {seeAllLabel}
        </Link>
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------------ Nudge -- */

/** Ring-progress donut. Pure SVG, no library, no fill beyond the stroke. */
function ProgressRing({ done, total }: { done: number; total: number }) {
  const radius = 15;
  const circumference = 2 * Math.PI * radius;
  const fraction = total > 0 ? Math.min(1, done / total) : 0;

  return (
    <span className="relative inline-flex size-11 shrink-0 items-center justify-center">
      <svg viewBox="0 0 36 36" className="size-11 -rotate-90" aria-hidden>
        <circle cx="18" cy="18" r={radius} fill="none" strokeWidth="3" className="stroke-hairline" />
        <circle
          cx="18"
          cy="18"
          r={radius}
          fill="none"
          strokeWidth="3"
          strokeLinecap="round"
          className="stroke-brand"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - fraction)}
        />
      </svg>
      <span className="absolute text-caption font-semibold text-content-primary">
        {done}/{total}
      </span>
    </span>
  );
}

export function Nudge({
  href,
  title,
  description,
  done,
  total,
}: {
  href: string;
  title: string;
  description: string;
  done: number;
  total: number;
}) {
  return (
    <Link
      href={href}
      className="flex items-center gap-4 rounded-card bg-surface-raised px-4 py-4 outline-none transition-colors duration-150 ease hover:bg-surface-raised-hover focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
    >
      <ProgressRing done={done} total={total} />
      <span className="min-w-0 flex-1">
        <span className="block text-ui font-semibold text-content-primary">{title}</span>
        <span className="mt-0.5 block text-ui text-content-tertiary">{description}</span>
      </span>
      <ChevronRight className="size-5 shrink-0 text-content-tertiary" aria-hidden />
    </Link>
  );
}

/* ------------------------------------------------------------- Info strip -- */

export function InfoStrip({ items }: { items: { label: string; value: string }[] }) {
  return (
    <div className="flex rounded-card bg-surface-raised">
      {items.map((item, index) => (
        <div
          key={item.label}
          className={cn(
            'flex-1 px-4 py-3.5 text-center',
            index > 0 && 'border-l border-hairline',
          )}
        >
          <p className="text-caption text-content-tertiary">{item.label}</p>
          <p className="tnum mt-1 text-ui font-semibold text-content-primary">{item.value}</p>
        </div>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------ Chart frame -- */

export function ChartFrame({
  title,
  rangeStart,
  rangeEnd,
  action,
  children,
}: {
  title: React.ReactNode;
  rangeStart: string;
  rangeEnd: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-card bg-surface-raised p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="text-ui font-semibold text-content-primary">{title}</div>
        {action}
      </div>
      <div className="mt-4">{children}</div>
      <div className="mt-3 flex justify-between text-caption text-content-tertiary">
        <span>{rangeStart}</span>
        <span>{rangeEnd}</span>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------ Icon button -- */

export function IconButton({
  label,
  onClick,
  href,
  children,
}: {
  label: string;
  onClick?: () => void;
  href?: string;
  children: React.ReactNode;
}) {
  const className =
    'inline-flex size-9 items-center justify-center rounded-full bg-surface-raised text-content-primary outline-none transition-colors duration-150 ease hover:bg-surface-raised-hover focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background';

  if (href) {
    return (
      <Link href={href} aria-label={label} className={className}>
        {children}
      </Link>
    );
  }

  return (
    <button type="button" aria-label={label} onClick={onClick} className={className}>
      {children}
    </button>
  );
}
