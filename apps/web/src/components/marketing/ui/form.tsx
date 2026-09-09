'use client';

import type * as React from 'react';
import { AlertCircle, Info } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Guest-side form primitives.
 *
 * These mirror the props of `@/components/ui/primitives` exactly — `label`,
 * `htmlFor`, `error`, `hint`, `invalid`, `tone`, `title` — so the auth pages
 * only change how they look, never how they behave. `aria-describedby` is
 * wired here so no caller can forget it.
 */

export function Input({
  className,
  invalid,
  ...props
}: React.ComponentProps<'input'> & { invalid?: boolean }) {
  return (
    <input
      aria-invalid={invalid || undefined}
      className={cn(
        'h-12 w-full rounded-2xl border bg-paper px-4 text-[0.9375rem] text-forest',
        'placeholder:text-moss/50',
        'transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2',
        'focus-visible:ring-bright focus-visible:ring-offset-2 focus-visible:ring-offset-paper',
        'disabled:cursor-not-allowed disabled:bg-bone disabled:text-moss',
        invalid ? 'border-rust focus-visible:border-rust' : 'border-edge focus-visible:border-forest',
        className,
      )}
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
    <div className={cn('space-y-2', className)}>
      <label htmlFor={htmlFor} className="block text-[0.875rem] font-medium text-forest">
        {label}
      </label>
      <div aria-describedby={describedBy}>{children}</div>
      {error ? (
        <p id={`${htmlFor}-error`} role="alert" className="flex items-start gap-1.5 text-[0.8125rem] text-rust">
          <AlertCircle className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          {error}
        </p>
      ) : hint ? (
        <p id={`${htmlFor}-hint`} className="text-[0.8125rem] text-moss">
          {hint}
        </p>
      ) : null}
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
    warning: 'border-coral bg-coral/20',
    critical: 'border-rust/30 bg-rust/[0.06]',
    brand: 'border-bright bg-mint',
  } as const;

  const Icon = tone === 'critical' ? AlertCircle : Info;

  return (
    <div
      role={tone === 'critical' ? 'alert' : 'note'}
      className={cn('flex gap-3 rounded-2xl border p-4 text-[0.875rem] text-forest', tones[tone], className)}
    >
      <Icon
        className={cn('mt-0.5 size-4 shrink-0', tone === 'critical' ? 'text-rust' : 'text-forest')}
        aria-hidden
      />
      <div className="min-w-0 flex-1">
        {title ? <p className="mb-1 font-medium">{title}</p> : null}
        <div className="leading-relaxed text-forest/80">{children}</div>
      </div>
    </div>
  );
}
