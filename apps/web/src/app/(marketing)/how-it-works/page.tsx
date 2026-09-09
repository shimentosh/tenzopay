import { Button } from '@/components/marketing/ui/button';
import { PageHero } from '@/components/marketing/ui/page-hero';
import { Reveal } from '@/components/marketing/ui/reveal';

export const metadata = {
  title: 'How it works',
  description: 'From account to card to settled payment.',
};

const steps = [
  {
    title: 'Create an account',
    body: 'Sign up with an email and password. Card issuing is regulated, so identity verification comes next — it takes a couple of minutes.',
  },
  {
    title: 'Add USDT',
    body: 'You get a deposit address for the supported network. Send USDT there and watch it move through detection and network confirmation. Funds are credited once, at the confirmation depth shown on the deposit screen.',
  },
  {
    title: 'Issue cards',
    body: 'Name a card and set its limits. It is issued by our card partner and usable immediately. Create a separate card per vendor, campaign or team.',
  },
  {
    title: 'Spend',
    body: 'When a merchant requests an authorization, we check it against your available balance and the card’s limits before approving. If either would be exceeded, the payment is declined.',
  },
  {
    title: 'Settle and reconcile',
    body: 'An authorization places a hold. When the merchant captures, the hold becomes a settlement; if it expires or is voided, the hold returns to your available balance automatically.',
  },
];

export default function HowItWorksPage() {
  return (
    <>
      <PageHero
        eyebrow="How it works"
        title="From an empty account to a settled payment"
        lead="Five steps. The interesting one is the last, where a hold quietly becomes a payment."
      />

      <section className="mx-auto w-full max-w-container px-6 py-24 md:px-8 md:py-32">
        <ol className="mx-auto max-w-3xl">
          {steps.map((step, index) => (
            <li key={step.title}>
              <Reveal delay={index * 0.06}>
                <div className="flex gap-6 border-b border-edge py-8 first:pt-0 md:gap-10">
                  <span
                    aria-hidden
                    className="inline-flex size-12 shrink-0 items-center justify-center rounded-full bg-bright font-display text-[1rem] font-medium text-paper"
                  >
                    {String(index + 1).padStart(2, '0')}
                  </span>
                  <div className="min-w-0">
                    <h2 className="font-display text-h3 font-medium text-forest">{step.title}</h2>
                    <p className="mt-3 max-w-xl text-body-base text-moss">{step.body}</p>
                  </div>
                </div>
              </Reveal>
            </li>
          ))}
        </ol>

        <Reveal delay={0.1}>
          <div className="mx-auto mt-16 max-w-3xl rounded-4xl border border-edge bg-bone p-8 md:p-12">
            <h2 className="max-w-[22ch] font-display text-h3 font-medium text-forest">
              Why a hold is not the same as a payment
            </h2>
            <p className="mt-5 max-w-2xl text-body-base text-moss">
              When you pay, the merchant first asks to reserve an amount. That reservation is a{' '}
              <strong className="font-medium text-forest">hold</strong>: the money leaves your
              available balance but has not been taken yet. Days later the merchant captures the
              final amount — often different, as with a tip or a fuel pump. TenzoPay shows both
              states, so a hotel pre-authorization never looks like a completed charge.
            </p>
          </div>
        </Reveal>

        <Reveal delay={0.16}>
          <div className="mt-16 flex justify-center">
            <Button href="/signup" size="lg">
              Get your card
            </Button>
          </div>
        </Reveal>
      </section>
    </>
  );
}
