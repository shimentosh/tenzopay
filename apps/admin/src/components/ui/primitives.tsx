'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';
import { Card } from '@/components/ui/card';
import { Badge as ShadcnBadge } from '@/components/ui/badge';
import { Input as ShadcnInput } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert as ShadcnAlert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';

/**
 * TenzoPay's domain layer over shadcn/ui.
 *
 * shadcn owns the component behaviour and accessibility; this file adds the
 * few things specific to this product — a panel with a header, a status badge
 * that maps domain states to colours in one place, and a form field that wires
 * up `aria-describedby` so no caller can forget it.
 */

export { Label, Skeleton };

/* -------------------------------------------------------------- Surfaces -- */

/** A shadcn Card with this app's panel radius and border treatment. */
export function Panel({
  className,
  ...props
}: React.ComponentProps<typeof Card>) {
  return (
    <Card
      className={cn(
        'gap-0 rounded-[var(--radius-panel)] border-border py-0 shadow-[var(--shadow-subtle)]',
        className,
      )}
      {...props}
    />
  );
}

export function PanelHeader({
  title,
  description,
  action,
  className,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'flex flex-wrap items-start justify-between gap-3 border-b px-5 py-4',
        className,
      )}
    >
      <div className="min-w-0">
        <h2 className="text-[15px] font-semibold text-foreground">{title}</h2>
        {description ? (
          <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>
        ) : null}
      </div>
      {action}
    </div>
  );
}

/* ---------------------------------------------------------------- Badge --- */

type Tone = 'neutral' | 'positive' | 'warning' | 'critical' | 'brand';

const toneClass: Record<Tone, string> = {
  neutral: 'bg-muted text-muted-foreground border-transparent',
  positive:
    'border-transparent bg-positive-soft text-[color-mix(in_oklch,var(--color-positive),black_18%)]',
  warning:
    'border-transparent bg-warning-soft text-[color-mix(in_oklch,var(--color-warning),black_28%)]',
  critical:
    'border-transparent bg-critical-soft text-[color-mix(in_oklch,var(--color-critical),black_10%)]',
  brand: 'border-transparent bg-accent text-accent-foreground',
};

export function Badge({
  className,
  tone = 'neutral',
  dot,
  children,
  ...props
}: React.ComponentProps<typeof ShadcnBadge> & { tone?: Tone; dot?: boolean }) {
  return (
    <ShadcnBadge
      variant="outline"
      className={cn('gap-1.5 rounded-full px-2.5 py-1', toneClass[tone], className)}
      {...props}
    >
      {dot ? <span className="size-1.5 rounded-full bg-current" aria-hidden /> : null}
      {children}
    </ShadcnBadge>
  );
}

/**
 * Maps a domain status to a colour in ONE place, so a deposit that is
 * CONFIRMING and a card that is FROZEN always read the same way across the app.
 */
export function StatusBadge({ status }: { status: string }) {
  const tone: Tone =
    status === 'ACTIVE' ||
    status === 'CONFIRMED' ||
    status === 'SETTLED' ||
    status === 'ACCEPTED' ||
    status === 'PROCESSED'
      ? 'positive'
      : status === 'FROZEN' ||
          status === 'PENDING' ||
          status === 'CONFIRMING' ||
          status === 'DETECTED' ||
          status === 'PENDING_REVIEW' ||
          status === 'PENDING_DOCUMENT' ||
          status === 'SHADOWING' ||
          status === 'RECEIVED'
        ? 'warning'
        : status === 'CLOSED' ||
            status === 'DECLINED' ||
            status === 'FAILED' ||
            status === 'REJECTED' ||
            status === 'ORPHANED' ||
            status === 'DEAD_LETTER'
          ? 'critical'
          : 'neutral';

  const label = status
    .replace(/_/g, ' ')
    .toLowerCase()
    .replace(/^\w/, (c) => c.toUpperCase());

  return (
    <Badge tone={tone} dot>
      {label}
    </Badge>
  );
}

/* ---------------------------------------------------------------- Forms --- */

export function Input({
  className,
  invalid,
  ...props
}: React.ComponentProps<typeof ShadcnInput> & { invalid?: boolean }) {
  return (
    <ShadcnInput
      aria-invalid={invalid || undefined}
      className={cn('h-10 bg-card', className)}
      {...props}
    />
  );
}

export function Field({
  label,
  htmlFor,
  error,
  hint,
  children,
  className,
}: {
  label: string;
  htmlFor: string;
  error?: string;
  hint?: string;
  children: React.ReactNode;
  className?: string;
}) {
  const describedBy = error ? `${htmlFor}-error` : hint ? `${htmlFor}-hint` : undefined;

  return (
    <div className={cn('space-y-1.5', className)}>
      <Label htmlFor={htmlFor}>{label}</Label>
      {/* aria-describedby is wired here so every field announces its own error
          without each caller remembering to do it. */}
      <div aria-describedby={describedBy}>{children}</div>
      {error ? (
        <p id={`${htmlFor}-error`} role="alert" className="text-xs text-destructive">
          {error}
        </p>
      ) : hint ? (
        <p id={`${htmlFor}-hint`} className="text-xs text-muted-foreground">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

/* -------------------------------------------------------------- Feedback -- */

export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
      {icon ? (
        <div className="mb-3 flex size-11 items-center justify-center rounded-full bg-muted text-muted-foreground">
          {icon}
        </div>
      ) : null}
      <p className="text-sm font-medium text-foreground">{title}</p>
      {description ? (
        <p className="mt-1 max-w-sm text-sm text-muted-foreground">{description}</p>
      ) : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

export function Alert({
  tone = 'warning',
  title,
  children,
  className,
}: {
  tone?: 'warning' | 'critical' | 'brand';
  title?: string;
  children: React.ReactNode;
  className?: string;
}) {
  const tones = {
    warning: 'border-warning/25 bg-warning-soft text-foreground',
    critical: 'border-destructive/25 bg-critical-soft text-foreground',
    brand: 'border-accent-foreground/15 bg-accent text-foreground',
  };

  return (
    <ShadcnAlert
      role={tone === 'critical' ? 'alert' : 'note'}
      className={cn('rounded-xl', tones[tone], className)}
    >
      {title ? <AlertTitle className="font-semibold">{title}</AlertTitle> : null}
      <AlertDescription className="text-foreground/80 [&_p]:leading-relaxed">
        {children}
      </AlertDescription>
    </ShadcnAlert>
  );
}
