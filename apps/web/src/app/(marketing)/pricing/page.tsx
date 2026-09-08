import Link from 'next/link';
import { Check } from 'lucide-react';
import { Button } from '@/components/ui/button';

export const metadata = {
  title: 'Pricing',
  description: 'Straightforward pricing for TenzoPay accounts.',
};

const tiers = [
  {
    name: 'Starter',
    price: 'Free',
    cadence: '',
    description: 'For individuals getting a handle on their spending.',
    features: [
      'Up to 3 virtual cards',
      'One USDT balance',
      'Per-card daily and monthly limits',
      'Freeze and unfreeze',
      'Transaction history and exports',
    ],
    cta: 'Get started',
    highlighted: false,
  },
  {
    name: 'Team',
    price: '$19',
    cadence: '/month',
    description: 'For teams running vendors, ads and subscriptions.',
    features: [
      'Up to 20 virtual cards',
      'Per-transaction limits',
      'Spending overview by card',
      'Notifications for every state change',
      'Priority support',
    ],
    cta: 'Get started',
    highlighted: true,
  },
  {
    name: 'Business',
    price: 'Contact us',
    cadence: '',
    description: 'For organisations needing higher limits and controls.',
    features: [
      'Custom card limits',
      'Dedicated onboarding',
      'Advanced reporting',
      'Role-based team access',
    ],
    cta: 'Contact sales',
    highlighted: false,
  },
];

export default function PricingPage() {
  return (
    <>
      <section className="border-b border-border bg-card">
        <div className="mx-auto max-w-3xl px-5 py-16 text-center lg:py-20">
          <h1 className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
            Simple pricing
          </h1>
          <p className="mx-auto mt-4 max-w-xl text-[17px] leading-relaxed text-muted-foreground">
            No hidden charges. Network and blockchain fees, where they apply, are
            shown before you confirm anything.
          </p>
        </div>
      </section>

      <section className="mx-auto max-w-5xl px-5 py-16">
        <div className="grid gap-6 lg:grid-cols-3">
          {tiers.map((tier) => (
            <div
              key={tier.name}
              className={
                tier.highlighted
                  ? 'card-surface relative border-primary/40 p-6 shadow-[var(--shadow-raised)]'
                  : 'card-surface p-6'
              }
            >
              {tier.highlighted ? (
                <span className="absolute -top-2.5 left-6 rounded-full bg-primary px-2.5 py-0.5 text-[11px] font-semibold text-primary-foreground">
                  Most popular
                </span>
              ) : null}

              <h2 className="font-semibold text-foreground">{tier.name}</h2>
              <p className="mt-3">
                <span className="tnum text-3xl font-semibold tracking-tight text-foreground">
                  {tier.price}
                </span>
                <span className="text-sm text-muted-foreground">{tier.cadence}</span>
              </p>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                {tier.description}
              </p>

              <ul className="mt-6 space-y-2.5">
                {tier.features.map((feature) => (
                  <li key={feature} className="flex gap-2.5 text-sm text-foreground/80">
                    <Check
                      className="mt-0.5 size-4 shrink-0 text-positive"
                      strokeWidth={2.5}
                      aria-hidden
                    />
                    {feature}
                  </li>
                ))}
              </ul>

              <Button
                asChild
                className="mt-7 w-full"
                variant={tier.highlighted ? 'default' : 'secondary'}
              >
                <Link href="/signup">{tier.cta}</Link>
              </Button>
            </div>
          ))}
        </div>

        {/* Required context, not fine print to be hidden. */}
        <p className="mx-auto mt-10 max-w-2xl text-center text-xs leading-relaxed text-muted-foreground">
          TenzoPay is a demonstration product operating against sandbox
          infrastructure. No charges are made and no real funds are held. Pricing
          shown is illustrative.
        </p>
      </section>
    </>
  );
}
