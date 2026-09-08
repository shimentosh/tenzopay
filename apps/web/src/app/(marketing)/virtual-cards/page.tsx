import Link from 'next/link';
import { Check, Minus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { VirtualCard } from '@/components/virtual-card';
import type { CardSummary } from '@tenzopay/shared';

export const metadata = {
  title: 'Cards',
  description: 'Virtual cards with per-card limits, drawing on one balance.',
};

const sample: CardSummary = {
  id: 'sample',
  name: 'Marketing',
  lastFour: '4821',
  expMonth: '09',
  expYear: '2030',
  network: 'VISA',
  status: 'ACTIVE',
  dailyLimit: '50000',
  monthlyLimit: '500000',
  perTransactionLimit: '25000',
  spentToday: '18400',
  spentThisMonth: '214000',
  createdAt: new Date().toISOString(),
};

/**
 * Capability table.
 *
 * Both columns are filled in honestly: a virtual card genuinely cannot be
 * tapped at a terminal or used at an ATM, and saying so is more useful than
 * implying otherwise.
 */
const capabilities: { label: string; supported: boolean; note?: string }[] = [
  { label: 'Online and card-not-present payments', supported: true },
  { label: 'Recurring subscriptions', supported: true },
  { label: 'Per-transaction limit', supported: true },
  { label: 'Daily and monthly velocity limits', supported: true },
  { label: 'Freeze and unfreeze instantly', supported: true },
  { label: 'Close permanently', supported: true },
  { label: 'Secure card number reveal', supported: true },
  {
    label: 'Contactless payments',
    supported: false,
    note: 'Requires a physical card',
  },
  { label: 'ATM withdrawals', supported: false, note: 'Requires a physical card' },
  {
    label: 'Chip and PIN at a terminal',
    supported: false,
    note: 'Requires a physical card',
  },
];

export default function CardsPage() {
  return (
    <>
      <section className="border-b border-border bg-card">
        <div className="mx-auto grid max-w-5xl items-center gap-12 px-5 py-16 lg:grid-cols-2 lg:py-20">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
              A card for every purpose
            </h1>
            <p className="mt-4 text-[17px] leading-relaxed text-muted-foreground">
              Issue a separate card for each vendor, campaign or team. Give each
              one its own ceiling. Freeze any of them without touching the
              others.
            </p>
            <div className="mt-7 flex flex-wrap gap-3">
              <Button asChild size="lg">
                <Link href="/signup">Create your first card</Link>
              </Button>
              <Button asChild size="lg" variant="secondary">
                <Link href="/how-it-works">How it works</Link>
              </Button>
            </div>
          </div>

          <div className="mx-auto w-full max-w-sm">
            <VirtualCard card={sample} />
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-3xl px-5 py-16">
        <h2 className="text-xl font-semibold tracking-tight text-foreground">
          What a TenzoPay card can and cannot do
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          TenzoPay issues virtual cards. Physical cards are not available.
        </p>

        <ul className="card-surface mt-6 divide-y divide-border">
          {capabilities.map((capability) => (
            <li
              key={capability.label}
              className="flex items-center gap-3 px-5 py-3.5"
            >
              {capability.supported ? (
                <span
                  className="flex size-5 shrink-0 items-center justify-center rounded-full bg-positive-soft"
                  aria-hidden
                >
                  <Check className="size-3 text-positive" strokeWidth={3} />
                </span>
              ) : (
                <span
                  className="flex size-5 shrink-0 items-center justify-center rounded-full bg-muted"
                  aria-hidden
                >
                  <Minus className="size-3 text-muted-foreground" strokeWidth={3} />
                </span>
              )}

              <span
                className={
                  capability.supported
                    ? 'text-sm text-foreground'
                    : 'text-sm text-muted-foreground'
                }
              >
                {capability.label}
              </span>
              <span className="sr-only">
                {capability.supported ? 'Supported' : 'Not supported'}
              </span>

              {capability.note ? (
                <span className="ml-auto text-xs text-muted-foreground">
                  {capability.note}
                </span>
              ) : null}
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}
