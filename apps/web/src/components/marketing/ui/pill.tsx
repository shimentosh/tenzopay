import { cn } from '@/lib/utils';

/** Small rounded label. Pills are always fully rounded, never a soft rect. */
export function Pill({
  children,
  className,
  tone = 'light',
}: {
  children: React.ReactNode;
  className?: string;
  tone?: 'light' | 'mint' | 'dark' | 'onDark';
}) {
  const tones = {
    light: 'border border-edge bg-paper text-moss',
    mint: 'border border-transparent bg-mint text-forest',
    dark: 'border border-transparent bg-forest text-paper',
    onDark: 'border border-paper/20 bg-paper/5 text-paper/80',
  } as const;

  return (
    <span
      className={cn(
        'inline-flex items-center gap-2 rounded-full px-3.5 py-1.5 text-micro font-medium uppercase',
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}
