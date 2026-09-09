import { cn } from '@/lib/utils';

/**
 * TenzoPay mark: two offset rounded bars reading as a card over a balance —
 * the product's whole idea in one glyph.
 */
export function Logo({
  className,
  showWordmark = true,
  inverted = false,
}: {
  className?: string;
  showWordmark?: boolean;
  inverted?: boolean;
}) {
  return (
    <span className={cn('flex items-center gap-2.5', className)}>
      <svg
        viewBox="0 0 32 32"
        className="size-7 shrink-0"
        aria-hidden
        fill="none"
      >
        <rect
          width="32"
          height="32"
          rx="9"
          fill={inverted ? 'var(--surface-page)' : 'var(--content-primary)'}
        />
        <rect
          x="7"
          y="9.5"
          width="18"
          height="6"
          rx="3"
          fill={inverted ? 'var(--content-primary)' : 'var(--surface-page)'}
        />
        <rect
          x="7"
          y="18"
          width="11"
          height="5"
          rx="2.5"
          fill={inverted ? 'var(--content-primary)' : 'var(--surface-page)'}
          fillOpacity="0.6"
        />
      </svg>
      {showWordmark ? (
        <span
          className={cn(
            'text-[17px] font-semibold tracking-tight',
            inverted ? 'text-white' : 'text-ink-900',
          )}
        >
          TenzoPay
        </span>
      ) : null}
    </span>
  );
}
