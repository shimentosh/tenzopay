import { SITE } from '@/lib/marketing';
import { Button } from '@/components/marketing/ui/button';
import { CardMockup } from '@/components/marketing/ui/card-mockup';
import { Reveal } from '@/components/marketing/ui/reveal';

export function FinalCta() {
  return (
    <section aria-labelledby="cta-heading" className="bg-paper px-4 pb-16 pt-24 md:px-6 md:pb-20 md:pt-32">
      <div className="relative mx-auto w-full max-w-[1400px] overflow-hidden rounded-4xl bg-bright px-6 py-20 md:px-8 md:py-28">
        <div aria-hidden className="pointer-events-none absolute inset-0 opacity-70">
          <div className="absolute -left-16 top-8 w-64 -rotate-12 motion-safe:animate-drift-slow">
            <CardMockup tone="forest" last4="1179" holder="SUBSCRIPTIONS" expiry="04/31" />
          </div>
          <div
            className="absolute -right-14 bottom-4 w-72 rotate-12 motion-safe:animate-drift-slow"
            style={{ animationDelay: '2.2s' }}
          >
            <CardMockup tone="ink" last4="6034" holder="TRAVEL" expiry="11/29" />
          </div>
        </div>

        <div className="relative mx-auto max-w-2xl text-center">
          <Reveal>
            <h2 id="cta-heading" className="font-display text-h2 font-medium text-paper">
              Your first card is a minute away.
            </h2>
          </Reveal>
          <Reveal delay={0.08}>
            <p className="mx-auto mt-5 max-w-md text-body-lg text-paper/80">
              Open an account, set a ceiling, and see the whole thing work end to end.
            </p>
          </Reveal>
          <Reveal delay={0.16}>
            <div className="mt-9 flex flex-wrap justify-center gap-3">
              <Button href={SITE.primaryCta.href} variant="dark" size="lg">
                {SITE.primaryCta.label}
              </Button>
              <Button href={SITE.secondaryCta.href} variant="light" size="lg">
                {SITE.secondaryCta.label}
              </Button>
            </div>
          </Reveal>
          <Reveal delay={0.24}>
            <p className="mt-6 text-[0.8125rem] text-paper/80">
              Starter is free and stays free. Nothing to cancel.
            </p>
          </Reveal>
        </div>
      </div>
    </section>
  );
}
