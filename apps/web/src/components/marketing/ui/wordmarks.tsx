import { cn } from '@/lib/utils';

/**
 * The TenzoPay mark: one path, one colour. The "T" is knocked out of the
 * rounded square with `evenodd`, so the whole logo inherits `currentColor`
 * and works on any background without a second fill.
 */
export function BrandWordmark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 152 30" className={cn('h-7 w-auto', className)} role="img" aria-label="TenzoPay">
      <path
        fill="currentColor"
        fillRule="evenodd"
        d="M0 9a9 9 0 0 1 9-9h12a9 9 0 0 1 9 9v12a9 9 0 0 1-9 9H9a9 9 0 0 1-9-9V9Zm8 0.5h14v3h-5.5v9h-3v-9H8v-3Z"
      />
      <text
        x="39"
        y="21"
        fill="currentColor"
        fontFamily="inherit"
        fontSize="20"
        fontWeight="600"
        letterSpacing="-0.03em"
      >
        TenzoPay
      </text>
    </svg>
  );
}

type MarkStyle = {
  name: string;
  weight: number;
  spacing: string;
  transform?: 'uppercase' | 'lowercase';
  italic?: boolean;
};

/**
 * Merchant marks are drawn as SVG wordmarks rather than loaded as images —
 * the page ships zero external assets. They are named as *examples of what a
 * card gets assigned to*, not as partners or integrations.
 */
export const merchantMarks: MarkStyle[] = [
  { name: 'Stripe', weight: 700, spacing: '-0.04em' },
  { name: 'Shopify', weight: 600, spacing: '-0.02em' },
  { name: 'Google Ads', weight: 500, spacing: '-0.01em' },
  { name: 'Meta', weight: 600, spacing: '-0.03em' },
  { name: 'TikTok', weight: 700, spacing: '-0.04em' },
  { name: 'Netflix', weight: 700, spacing: '0.04em', transform: 'uppercase' },
  { name: 'AWS', weight: 700, spacing: '-0.02em' },
  { name: 'OpenAI', weight: 500, spacing: '0.01em' },
  { name: 'Figma', weight: 600, spacing: '-0.02em' },
  { name: 'Notion', weight: 500, spacing: '-0.01em' },
  { name: 'Spotify', weight: 700, spacing: '-0.03em' },
  { name: 'Adobe', weight: 600, spacing: '-0.02em', italic: true },
];

export function MerchantWordmark({ mark, className }: { mark: MarkStyle; className?: string }) {
  const label = mark.transform === 'uppercase' ? mark.name.toUpperCase() : mark.name;
  const width = label.length * 12 + 8;

  return (
    <svg
      viewBox={`0 0 ${width} 26`}
      className={cn('h-5 w-auto', className)}
      role="img"
      aria-label={mark.name}
      style={{ width: `${width / 26}em`, fontSize: '1.25rem' }}
    >
      <text
        x="0"
        y="19"
        fill="currentColor"
        fontFamily="inherit"
        fontSize="19"
        fontWeight={mark.weight}
        fontStyle={mark.italic ? 'italic' : undefined}
        letterSpacing={mark.spacing}
      >
        {label}
      </text>
    </svg>
  );
}
