import {
  AlertTriangle,
  Eye,
  FileCheck2,
  KeyRound,
  Lock,
  ScrollText,
  ShieldCheck,
} from 'lucide-react';
import { Button } from '@/components/marketing/ui/button';
import { PageHero } from '@/components/marketing/ui/page-hero';
import { Reveal, RevealGroup, RevealItem } from '@/components/marketing/ui/reveal';

export const metadata = {
  title: 'Security',
  description: 'How TenzoPay protects funds, card data and accounts.',
};

const practices = [
  {
    icon: Lock,
    title: 'Card numbers never touch our servers',
    body: 'When you reveal a card, the number and CVV are rendered by the card issuer inside a secure frame in your browser. TenzoPay never receives, stores or logs them.',
  },
  {
    icon: ScrollText,
    title: 'Balances are derived, never edited',
    body: 'Every movement of value is recorded as a pair of permanent, immutable entries. Your balance is calculated from that history, so it cannot be silently overwritten — not even by staff.',
  },
  {
    icon: ShieldCheck,
    title: 'Authorizations are checked in real time',
    body: 'Every card authorization is checked against your actual available balance before it is approved. If our systems cannot answer, the payment is declined rather than approved.',
  },
  {
    icon: KeyRound,
    title: 'Modern credential handling',
    body: 'Passwords are hashed with argon2id. Sessions use httpOnly cookies with rotating refresh tokens, and re-using a rotated token revokes the whole session family.',
  },
  {
    icon: FileCheck2,
    title: 'Verified webhooks and idempotent processing',
    body: 'Inbound events are signature-verified with a replay window and processed exactly once, so a duplicate delivery can never credit or debit you twice.',
  },
  {
    icon: Eye,
    title: 'Every privileged action is recorded',
    body: 'Staff operate under role-based permissions on a separate system, and every action they take is written to an append-only audit log with a mandatory reason.',
  },
];

const limitations = [
  {
    lead: 'Deposits are simulated or testnet only.',
    body: 'Production deposits would require a regulated custody provider to hold assets and manage keys. TenzoPay holds no private keys at all.',
  },
  {
    lead: 'Stablecoin balances do not settle card spend.',
    body: 'Converting a crypto balance into funds a card network can settle against requires a licensed off-ramp and a sponsoring bank. Neither is part of this build.',
  },
  {
    lead: 'Compliance is partial.',
    body: 'Identity verification runs through the card issuer’s sandbox. Sanctions screening and ongoing transaction monitoring require a dedicated provider and are not implemented.',
  },
];

export default function SecurityPage() {
  return (
    <>
      <PageHero
        eyebrow="Security"
        title="How the money is kept honest"
        lead="Handling other people’s money is a responsibility before it is a product. Here is exactly how TenzoPay is built, and — just as importantly — what it does not yet do."
      />

      <section aria-labelledby="practices-heading" className="bg-paper py-24 md:py-32">
        <div className="mx-auto w-full max-w-container px-6 md:px-8">
          <Reveal>
            <h2 id="practices-heading" className="text-micro font-medium uppercase text-moss">
              What is in place
            </h2>
          </Reveal>

          <RevealGroup className="mt-8 grid gap-6 md:grid-cols-2 md:gap-8" delayChildren={0.08}>
            {practices.map((practice) => (
              <RevealItem key={practice.title}>
                <article className="group h-full rounded-4xl border border-edge bg-paper p-8 transition-colors duration-300 hover:border-bright md:p-10">
                  <span className="inline-flex size-12 items-center justify-center rounded-full bg-mint text-forest transition-transform duration-300 group-hover:scale-[1.08]">
                    <practice.icon className="size-5" aria-hidden />
                  </span>
                  <h3 className="mt-6 max-w-[24ch] font-display text-h3 font-medium text-forest">
                    {practice.title}
                  </h3>
                  <p className="mt-4 text-body-base text-moss">{practice.body}</p>
                </article>
              </RevealItem>
            ))}
          </RevealGroup>
        </div>
      </section>

      {/*
        The honest section. A security page that only lists strengths is
        marketing; naming the gaps is what makes the rest credible.
      */}
      <section aria-labelledby="limits-heading" className="bg-forest py-24 md:py-32">
        <div className="mx-auto w-full max-w-container px-6 md:px-8">
          <div className="mx-auto max-w-3xl">
            <Reveal>
              <span className="inline-flex size-12 items-center justify-center rounded-full bg-coral text-forest">
                <AlertTriangle className="size-5" aria-hidden />
              </span>
            </Reveal>
            <Reveal delay={0.08}>
              <h2 id="limits-heading" className="mt-7 font-display text-h2 font-medium text-paper">
                What TenzoPay is not
              </h2>
            </Reveal>
            <Reveal delay={0.16}>
              <p className="mt-6 text-body-lg text-paper/70">
                TenzoPay is a demonstration product running against sandbox infrastructure. It is
                not a bank, it is not licensed as a money transmitter, and it does not custody real
                customer funds.
              </p>
            </Reveal>

            <RevealGroup className="mt-10 space-y-6" delayChildren={0.2}>
              {limitations.map((item) => (
                <RevealItem key={item.lead} y={16}>
                  <div className="flex gap-4 border-t border-paper/15 pt-6">
                    <span aria-hidden className="mt-2 size-1.5 shrink-0 rounded-full bg-coral" />
                    <p className="text-body-base text-paper/70">
                      <strong className="font-medium text-paper">{item.lead}</strong> {item.body}
                    </p>
                  </div>
                </RevealItem>
              ))}
            </RevealGroup>

            <Reveal delay={0.28}>
              <p className="mt-10 text-[0.9375rem] leading-relaxed text-paper/60">
                Simulated funds are labelled as such everywhere they appear, and the application
                refuses to start in a production configuration while demo mode is enabled.
              </p>
            </Reveal>
          </div>
        </div>
      </section>

      <section aria-labelledby="security-cta" className="bg-paper py-24 md:py-32">
        <div className="mx-auto w-full max-w-container px-6 text-center md:px-8">
          <Reveal>
            <h2 id="security-cta" className="font-display text-h2 font-medium text-forest">
              Questions about how something works?
            </h2>
          </Reveal>
          <Reveal delay={0.08}>
            <p className="mx-auto mt-5 max-w-lg text-body-lg text-moss">
              The full architecture, including every limitation, is documented alongside the source.
            </p>
          </Reveal>
          <Reveal delay={0.16}>
            <div className="mt-9 flex justify-center">
              <Button href="/faq" size="lg">
                Read the FAQ
              </Button>
            </div>
          </Reveal>
        </div>
      </section>
    </>
  );
}
