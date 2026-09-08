import Link from 'next/link';
import {
  AlertTriangle,
  Eye,
  FileCheck2,
  KeyRound,
  Lock,
  ScrollText,
  ShieldCheck,
} from 'lucide-react';
import { Button } from '@/components/ui/button';

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

export default function SecurityPage() {
  return (
    <>
      <section className="border-b border-border bg-card">
        <div className="mx-auto max-w-4xl px-5 py-16 lg:py-20">
          <h1 className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
            Security
          </h1>
          <p className="mt-4 max-w-2xl text-[17px] leading-relaxed text-muted-foreground">
            Handling other people&rsquo;s money is a responsibility before it is
            a product. Here is exactly how TenzoPay is built, and — just as
            importantly — what it does not yet do.
          </p>
        </div>
      </section>

      <section className="mx-auto max-w-4xl px-5 py-16">
        <div className="grid gap-6 sm:grid-cols-2">
          {practices.map((practice) => (
            <div key={practice.title} className="card-surface p-6">
              <div className="flex size-10 items-center justify-center rounded-xl bg-accent text-primary">
                <practice.icon className="size-5" aria-hidden />
              </div>
              <h2 className="mt-4 font-semibold text-foreground">{practice.title}</h2>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                {practice.body}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/*
        The honest section. A security page that only lists strengths is
        marketing; naming the gaps is what makes the rest credible.
      */}
      <section className="border-y border-border bg-card">
        <div className="mx-auto max-w-4xl px-5 py-16">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-1 size-5 shrink-0 text-warning" aria-hidden />
            <div>
              <h2 className="text-xl font-semibold tracking-tight text-foreground">
                What TenzoPay is not
              </h2>
              <p className="mt-3 leading-relaxed text-muted-foreground">
                TenzoPay is a demonstration product running against sandbox
                infrastructure. It is not a bank, it is not licensed as a money
                transmitter, and it does not custody real customer funds.
              </p>

              <ul className="mt-5 space-y-3 text-sm leading-relaxed text-muted-foreground">
                <li className="flex gap-3">
                  <span className="mt-2 size-1.5 shrink-0 rounded-full bg-ink-300" aria-hidden />
                  <span>
                    <strong className="font-medium text-foreground">
                      Deposits are simulated or testnet only.
                    </strong>{' '}
                    Production deposits would require a regulated custody
                    provider to hold assets and manage keys. TenzoPay holds no
                    private keys at all.
                  </span>
                </li>
                <li className="flex gap-3">
                  <span className="mt-2 size-1.5 shrink-0 rounded-full bg-ink-300" aria-hidden />
                  <span>
                    <strong className="font-medium text-foreground">
                      Stablecoin balances do not settle card spend.
                    </strong>{' '}
                    Converting a crypto balance into funds a card network can
                    settle against requires a licensed off-ramp and a sponsoring
                    bank. Neither is part of this build.
                  </span>
                </li>
                <li className="flex gap-3">
                  <span className="mt-2 size-1.5 shrink-0 rounded-full bg-ink-300" aria-hidden />
                  <span>
                    <strong className="font-medium text-foreground">
                      Compliance is partial.
                    </strong>{' '}
                    Identity verification runs through the card issuer&rsquo;s
                    sandbox. Sanctions screening and ongoing transaction
                    monitoring require a dedicated provider and are not
                    implemented.
                  </span>
                </li>
              </ul>

              <p className="mt-5 text-sm leading-relaxed text-muted-foreground">
                Simulated funds are labelled as such everywhere they appear, and
                the application refuses to start in a production configuration
                while demo mode is enabled.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-4xl px-5 py-16 text-center">
        <h2 className="text-xl font-semibold tracking-tight text-foreground">
          Questions about how something works?
        </h2>
        <p className="mx-auto mt-2 max-w-lg text-muted-foreground">
          The full architecture, including every limitation, is documented
          alongside the source.
        </p>
        <Button asChild className="mt-6">
          <Link href="/faq">Read the FAQ</Link>
        </Button>
      </section>
    </>
  );
}
