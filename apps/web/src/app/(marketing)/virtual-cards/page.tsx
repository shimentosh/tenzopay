import { Check, Minus } from 'lucide-react';
import { Button } from '@/components/marketing/ui/button';
import { CardMockup } from '@/components/marketing/ui/card-mockup';
import { Pill } from '@/components/marketing/ui/pill';
import { Reveal } from '@/components/marketing/ui/reveal';

export const metadata = {
  title: 'Cards',
  description: 'Virtual cards with per-card limits, drawing on one balance.',
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
  { label: 'Contactless payments', supported: false, note: 'Requires a physical card' },
  { label: 'ATM withdrawals', supported: false, note: 'Requires a physical card' },
  { label: 'Chip and PIN at a terminal', supported: false, note: 'Requires a physical card' },
];

export default function CardsPage() {
  return (
    <>
      <section
        aria-labelledby="cards-page-heading"
        className="border-b border-edge bg-bone pb-20 pt-[8.5rem] md:pb-24 md:pt-[10rem]"
      >
        <div className="mx-auto grid w-full max-w-container items-center gap-16 px-6 md:px-8 lg:grid-cols-2 lg:gap-8">
          <div>
            <Reveal>
              <Pill tone="mint">Cards</Pill>
            </Reveal>
            <Reveal delay={0.08}>
              <h1 id="cards-page-heading" className="mt-7 font-display text-h1 font-medium text-forest">
                A card for every purpose
              </h1>
            </Reveal>
            <Reveal delay={0.16}>
              <p className="mt-7 max-w-xl text-body-lg text-moss">
                Issue a separate card for each vendor, campaign or team. Give each one its own
                ceiling. Freeze any of them without touching the others.
              </p>
            </Reveal>
            <Reveal delay={0.24}>
              <div className="mt-9 flex flex-wrap gap-3">
                <Button href="/signup" size="lg">
                  Create your first card
                </Button>
                <Button href="/how-it-works" variant="secondary" size="lg">
                  How it works
                </Button>
              </div>
            </Reveal>
          </div>

          <Reveal delay={0.16} scale>
            <div className="mx-auto w-full max-w-[26rem]">
              <CardMockup
                tone="bright"
                last4="4821"
                holder="MARKETING"
                expiry="09/30"
                tilt
                className="shadow-float"
              />
            </div>
          </Reveal>
        </div>
      </section>

      <section aria-labelledby="capabilities-heading" className="bg-paper py-24 md:py-32">
        <div className="mx-auto w-full max-w-container px-6 md:px-8">
          <div className="mx-auto max-w-3xl">
            <Reveal>
              <h2 id="capabilities-heading" className="font-display text-h2 font-medium text-forest">
                What a card can and cannot do
              </h2>
            </Reveal>
            <Reveal delay={0.08}>
              <p className="mt-5 text-body-lg text-moss">
                TenzoPay issues virtual cards. Physical cards are not available, so the last three
                rows are honest noes rather than a roadmap.
              </p>
            </Reveal>

            <Reveal delay={0.16}>
              <ul className="mt-10 divide-y divide-edge rounded-4xl border border-edge">
                {capabilities.map((capability) => (
                  <li key={capability.label} className="flex items-center gap-4 px-6 py-4">
                    {capability.supported ? (
                      <span
                        className="flex size-6 shrink-0 items-center justify-center rounded-full bg-bright"
                        aria-hidden
                      >
                        <Check className="size-3.5 text-forest" strokeWidth={3} />
                      </span>
                    ) : (
                      <span
                        className="flex size-6 shrink-0 items-center justify-center rounded-full bg-sand"
                        aria-hidden
                      >
                        <Minus className="size-3.5 text-moss" strokeWidth={3} />
                      </span>
                    )}

                    <span
                      className={
                        capability.supported
                          ? 'text-[0.9375rem] text-forest'
                          : 'text-[0.9375rem] text-moss'
                      }
                    >
                      {capability.label}
                    </span>
                    <span className="sr-only">
                      {capability.supported ? 'Supported' : 'Not supported'}
                    </span>

                    {capability.note ? (
                      <span className="ml-auto hidden text-[0.75rem] text-moss sm:block">
                        {capability.note}
                      </span>
                    ) : null}
                  </li>
                ))}
              </ul>
            </Reveal>
          </div>
        </div>
      </section>
    </>
  );
}
