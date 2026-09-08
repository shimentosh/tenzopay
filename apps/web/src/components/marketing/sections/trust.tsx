import { Eye, FileLock2, KeyRound, Lock, ShieldOff } from 'lucide-react';
import { Reveal, RevealGroup, RevealItem } from '@/components/marketing/ui/reveal';

const badges = [
  { icon: Eye, label: 'Card data stays with the issuer' },
  { icon: Lock, label: 'Signatures verified in constant time' },
  { icon: ShieldOff, label: 'Errors decline, never approve' },
  { icon: FileLock2, label: 'Ledger entries are immutable' },
  { icon: KeyRound, label: 'Secrets never reach the browser' },
];

export function Trust() {
  return (
    <section aria-labelledby="trust-heading" className="border-y border-edge bg-bone py-20">
      <div className="mx-auto w-full max-w-container px-6 md:px-8">
        <Reveal>
          <h2 id="trust-heading" className="text-center text-micro font-medium uppercase text-moss">
            What is actually guaranteed
          </h2>
        </Reveal>

        <RevealGroup className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-5" delayChildren={0.08}>
          {badges.map((badge) => (
            <RevealItem key={badge.label} y={16}>
              <div className="flex h-full flex-col items-center gap-4 rounded-3xl border border-edge bg-paper px-5 py-7 text-center">
                <span className="inline-flex size-11 items-center justify-center rounded-full border border-edge text-forest">
                  <badge.icon className="size-5" aria-hidden strokeWidth={1.5} />
                </span>
                <p className="max-w-[18ch] text-[0.8125rem] leading-snug text-moss">{badge.label}</p>
              </div>
            </RevealItem>
          ))}
        </RevealGroup>

        <Reveal delay={0.2}>
          <p className="mx-auto mt-10 max-w-2xl text-center text-[0.8125rem] leading-relaxed text-moss">
            TenzoPay is a preview built on sandbox infrastructure. It is not a bank, is not licensed
            as a money transmitter, and holds no customer funds — deposits in this build are
            simulated, and that is labelled everywhere it appears.
          </p>
        </Reveal>
      </div>
    </section>
  );
}
