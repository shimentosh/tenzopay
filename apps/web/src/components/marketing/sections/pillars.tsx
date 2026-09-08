import { CreditCard, ScrollText, Timer, Wallet } from 'lucide-react';
import { Pill } from '@/components/marketing/ui/pill';
import { Reveal, RevealGroup, RevealItem } from '@/components/marketing/ui/reveal';

const pillars = [
  {
    icon: CreditCard,
    title: 'Instant virtual cards',
    body: 'Create a card for a merchant, a subscription or a campaign in seconds. Name it, cap it, and freeze it the moment the job is done.',
  },
  {
    icon: Wallet,
    title: 'One balance behind them all',
    body: 'Cards are spending instruments, not wallets. Nothing is moved onto a card, so nothing is ever stranded on one you stopped using.',
  },
  {
    icon: Timer,
    title: 'Decided while you wait',
    body: 'Each authorization is answered from your balance in the moment it happens. Anything unclear — an error, a timeout, a card we do not know — is declined.',
  },
  {
    icon: ScrollText,
    title: 'Built to be audited',
    body: 'Entries are immutable and every write is idempotent. A correction is a new balanced entry with a written reason, never an edited number.',
  },
];

export function Pillars() {
  return (
    <section id="controls" aria-labelledby="pillars-heading" className="scroll-mt-24 bg-paper py-24 md:py-32">
      <div className="mx-auto w-full max-w-container px-6 md:px-8">
        <div className="max-w-2xl">
          <Reveal>
            <Pill tone="mint">What you get</Pill>
          </Reveal>
          <Reveal delay={0.08}>
            <h2 id="pillars-heading" className="mt-6 font-display text-h2 font-medium text-forest">
              Four things, done properly.
            </h2>
          </Reveal>
          <Reveal delay={0.16}>
            <p className="mt-5 max-w-xl text-body-lg text-moss">
              The product is deliberately small. Each part below is finished, not planned.
            </p>
          </Reveal>
        </div>

        <RevealGroup className="mt-14 grid gap-6 md:grid-cols-2 md:gap-8" delayChildren={0.1}>
          {pillars.map((pillar) => (
            <RevealItem key={pillar.title}>
              <article className="group h-full rounded-4xl border border-edge bg-paper p-8 transition-colors duration-300 hover:border-bright md:p-10">
                <span className="inline-flex size-14 items-center justify-center rounded-full bg-mint text-forest transition-transform duration-300 group-hover:scale-[1.08]">
                  <pillar.icon className="size-6" aria-hidden />
                </span>
                <h3 className="mt-7 max-w-[12ch] font-display text-h3 font-medium text-forest">
                  {pillar.title}
                </h3>
                <p className="mt-4 max-w-md text-body-base text-moss">{pillar.body}</p>
              </article>
            </RevealItem>
          ))}
        </RevealGroup>
      </div>
    </section>
  );
}
