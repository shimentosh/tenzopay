import { Check } from 'lucide-react';
import { Button } from '@/components/marketing/ui/button';
import { PageHero } from '@/components/marketing/ui/page-hero';
import { Pill } from '@/components/marketing/ui/pill';
import { Reveal, RevealGroup, RevealItem } from '@/components/marketing/ui/reveal';

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
      <PageHero
        eyebrow="Pricing"
        title="Simple pricing"
        lead="No hidden charges. Network and blockchain fees, where they apply, are shown before you confirm anything."
      />

      <section aria-labelledby="tiers-heading" className="bg-paper py-24 md:py-32">
        <div className="mx-auto w-full max-w-container px-6 md:px-8">
          <h2 id="tiers-heading" className="sr-only">
            Plans
          </h2>

          <RevealGroup className="grid gap-6 lg:grid-cols-3 lg:gap-8" delayChildren={0.08}>
            {tiers.map((tier) => (
              <RevealItem key={tier.name} className={tier.highlighted ? 'lg:-mt-2' : undefined}>
                <article
                  className={
                    tier.highlighted
                      ? 'flex h-full flex-col rounded-4xl border border-bright bg-paper p-8 shadow-float md:p-10'
                      : 'flex h-full flex-col rounded-4xl border border-edge bg-paper p-8 md:p-10'
                  }
                >
                  <div className="flex items-center justify-between gap-4">
                    <h3 className="font-display text-h3 font-medium text-forest">{tier.name}</h3>
                    {tier.highlighted ? <Pill tone="mint">Most popular</Pill> : null}
                  </div>

                  <p className="mt-5">
                    <span className="font-display text-[2.75rem] font-medium leading-none tracking-[-0.02em] text-forest">
                      {tier.price}
                    </span>
                    <span className="text-[1.125rem] text-moss">{tier.cadence}</span>
                  </p>

                  <p className="mt-5 text-body-base text-moss">{tier.description}</p>

                  <ul className="mt-7 flex-1 space-y-3.5">
                    {tier.features.map((feature) => (
                      <li key={feature} className="flex items-start gap-3">
                        <span className="mt-0.5 inline-flex size-5 shrink-0 items-center justify-center rounded-full bg-mint text-forest">
                          <Check className="size-3" strokeWidth={3} aria-hidden />
                        </span>
                        <span className="text-[0.9375rem] text-moss">{feature}</span>
                      </li>
                    ))}
                  </ul>

                  <div className="mt-9">
                    <Button
                      href="/signup"
                      variant={tier.highlighted ? 'primary' : 'secondary'}
                      size="lg"
                      className="w-full"
                    >
                      {tier.cta}
                    </Button>
                  </div>
                </article>
              </RevealItem>
            ))}
          </RevealGroup>

          {/* Required context, not fine print to be hidden. */}
          <Reveal delay={0.16}>
            <p className="mx-auto mt-12 max-w-2xl text-center text-[0.8125rem] leading-relaxed text-moss">
              TenzoPay is a demonstration product operating against sandbox infrastructure. No
              charges are made and no real funds are held. Pricing shown is illustrative.
            </p>
          </Reveal>
        </div>
      </section>
    </>
  );
}
