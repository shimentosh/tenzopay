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
 *    UI. This system uses pill buttons at a comfortable 48px (`default`),
 *    with 24px of horizontal padding and a 600-weight label.
 */
const buttonVariants = cva(
  "group/button inline-flex shrink-0 items-center justify-center gap-2 rounded-pill text-ui font-semibold whitespace-nowrap outline-none select-none " +
    "transition-colors duration-150 ease " +
    "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background " +
    "disabled:pointer-events-none disabled:opacity-50 " +
    "[&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        // The one loud thing on the page. At most one visible per view.
        default: 'bg-brand text-content-on-accent hover:bg-brand-hover active:bg-brand-active',
        // Everything else is quiet: a tint step, never a border.
        secondary:
          'bg-surface-raised text-content-primary hover:bg-surface-raised-hover',
        outline: 'bg-surface-raised text-content-primary hover:bg-surface-raised-hover',
        ghost: 'text-content-secondary hover:bg-surface-raised hover:text-content-primary',
        // Semantic colour is text only — never a filled red button.
        destructive: 'bg-surface-raised text-negative hover:bg-surface-raised-hover',
        destructiveOutline: 'bg-surface-raised text-negative hover:bg-surface-raised-hover',
        link: 'text-content-primary underline underline-offset-4 hover:text-content-primary/80',
      },
      size: {
        default: 'h-12 px-6',
        sm: 'h-10 px-4',
        lg: 'h-14 px-8 text-value',
        icon: 'size-12',
        'icon-sm': 'size-10',
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
