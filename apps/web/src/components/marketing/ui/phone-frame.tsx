import { cn } from '@/lib/utils';

/** Device shell for the in-page product vignettes. Pure DOM, no image. */
export function PhoneFrame({
  children,
  className,
  tone = 'light',
}: {
  children: React.ReactNode;
  className?: string;
  tone?: 'light' | 'dark';
}) {
  return (
    <div
      className={cn(
        'relative mx-auto w-full max-w-[17rem] rounded-[2.25rem] border-[0.5rem] border-ink bg-ink shadow-float',
        className,
      )}
    >
      <div aria-hidden className="absolute left-1/2 top-2 z-20 h-5 w-24 -translate-x-1/2 rounded-full bg-ink" />
      <div
        className={cn(
          'relative h-full overflow-hidden rounded-[1.75rem]',
          tone === 'dark' ? 'bg-forest' : 'bg-bone',
        )}
      >
        {children}
      </div>
    </div>
  );
}
