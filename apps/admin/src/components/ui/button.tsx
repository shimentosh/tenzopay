import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { Slot } from 'radix-ui';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * shadcn/ui Button, with two deliberate local changes.
 *
 * 1. **A `loading` prop.** Every mutating action here moves money or changes a
 *    card, so the control must visibly disable itself and announce `aria-busy`
 *    while the request is in flight. Double-submitting a card creation is a
 *    real failure mode.
 * 2. **A larger size scale.** shadcn's default `h-8` is tuned for dense admin
 *    UI; a consumer fintech app wants comfortable targets, so `default` is
 *    `h-10` and `lg` is `h-12`.
 */
const buttonVariants = cva(
  "group/button inline-flex shrink-0 items-center justify-center gap-2 rounded-lg border border-transparent bg-clip-padding text-sm font-medium whitespace-nowrap transition-all outline-none select-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 active:not-aria-[haspopup]:translate-y-px disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default:
          'bg-primary text-primary-foreground shadow-[var(--shadow-subtle)] hover:bg-primary/90',
        outline:
          'border-border bg-card hover:bg-muted hover:text-foreground aria-expanded:bg-muted',
        secondary:
          'border-border bg-card text-foreground shadow-[var(--shadow-subtle)] hover:bg-muted aria-expanded:bg-muted',
        ghost: 'text-muted-foreground hover:bg-muted hover:text-foreground',
        destructive:
          'bg-destructive text-destructive-foreground hover:brightness-95 focus-visible:ring-destructive/30',
        // For destructive actions that should not look inviting.
        destructiveOutline:
          'border-destructive/30 bg-destructive/5 text-destructive hover:bg-destructive/10 focus-visible:ring-destructive/30',
        link: 'text-primary underline-offset-4 hover:underline',
      },
      size: {
        default: 'h-10 px-4',
        sm: 'h-8 gap-1.5 rounded-md px-3 text-[13px]',
        lg: 'h-12 px-6 text-[15px]',
        icon: 'size-9',
        'icon-sm': 'size-8 rounded-md',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
);

function Button({
  className,
  variant = 'default',
  size = 'default',
  asChild = false,
  loading = false,
  disabled,
  children,
  ...props
}: React.ComponentProps<'button'> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean;
    loading?: boolean;
  }) {
  const Comp = asChild ? Slot.Root : 'button';

  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(buttonVariants({ variant, size, className }))}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {/* asChild forwards to a single child (a Link, say), so a spinner cannot
          be injected alongside it without breaking Slot's single-child rule. */}
      {loading && !asChild ? (
        <>
          <Loader2 className="animate-spin" aria-hidden />
          {children}
        </>
      ) : (
        children
      )}
    </Comp>
  );
}

export { Button, buttonVariants };
