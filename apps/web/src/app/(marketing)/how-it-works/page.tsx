import Link from 'next/link';
import { Button } from '@/components/ui/button';

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
      <section className="border-b border-border bg-card">
        <div className="mx-auto max-w-3xl px-5 py-16 lg:py-20">
          <h1 className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
            How it works
          </h1>
          <p className="mt-4 text-[17px] leading-relaxed text-muted-foreground">
            Five steps, from opening an account to a settled payment.
          </p>
        </div>
      </section>

      <section className="mx-auto max-w-3xl px-5 py-16">
        <ol className="relative space-y-10 border-l border-border pl-8">
          {steps.map((step, index) => (
            <li key={step.title} className="relative">
              <span
                className="tnum absolute -left-[41px] flex size-[26px] items-center justify-center rounded-full bg-ink-900 text-xs font-semibold text-white"
                aria-hidden
              >
                {index + 1}
              </span>
              <h2 className="font-semibold text-foreground">{step.title}</h2>
              <p className="mt-1.5 leading-relaxed text-muted-foreground">{step.body}</p>
            </li>
          ))}
        </ol>

        <div className="card-surface mt-14 p-6">
          <h2 className="font-semibold text-foreground">
            Why a hold is not the same as a payment
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            When you pay, the merchant first asks to reserve an amount. That
            reservation is a <strong className="font-medium text-foreground">hold</strong>:
            the money leaves your available balance but has not been taken yet.
            Days later the merchant captures the final amount — often different,
            as with a tip or a fuel pump. TenzoPay shows both states, so a hotel
            pre-authorization never looks like a completed charge.
          </p>
        </div>

        <div className="mt-12 text-center">
          <Button asChild size="lg">
            <Link href="/signup">Get started</Link>
          </Button>
        </div>
      </section>
    </>
  );
}
