import { Check } from 'lucide-react';
import { Button } from '@/components/marketing/ui/button';
import { CodeWindow, type CodeTab } from '@/components/marketing/ui/code-window';
import { Pill } from '@/components/marketing/ui/pill';
import { Reveal } from '@/components/marketing/ui/reveal';

const points = [
  'Balances are summed from ledger entries on every read. There is no balance column to drift.',
  'Every financial write is idempotent under a natural key, so a retry returns the original.',
  'Balance-affecting reads run at SERIALIZABLE — two cards on one balance cannot both win.',
  'Card numbers are rendered by the issuer in your browser and never reach our servers.',
];

const tabs: CodeTab[] = [
  {
    id: 'request',
    label: 'ask',
    code: `# the network asks before the merchant is answered
POST /webhooks/lithic/auth-stream

{
  "token": "9f2a4c1e",
  "card_token": "c_8d31b7",
  "amount": 4250,
  "merchant": { "descriptor": "GOOGLE ADS" }
}`,
  },
  {
    id: 'decision',
    label: 'answer',
    code: `# checked against the shared balance, then the card ceiling
200 OK

{
  "result": "APPROVED",
  "reason": null
}

# any error, timeout or unknown card answers DECLINED`,
  },
  {
    id: 'ledger',
    label: 'ledger',
    code: `# one balanced transaction, keyed so a retry is a no-op
LedgerTransaction  auth:9f2a4c1e

  available   -42.50 USDT
  held        +42.50 USDT
  ----------------------------
  sum           0.00 USDT`,
  },
];

export function Build() {
  return (
    <section id="build" aria-labelledby="build-heading" className="scroll-mt-24 bg-forest py-24 md:py-32">
      <div className="mx-auto grid w-full max-w-container items-center gap-16 px-6 md:px-8 lg:grid-cols-2 lg:gap-12">
        <div>
          <Reveal>
            <Pill tone="onDark">Under the hood</Pill>
          </Reveal>
          <Reveal delay={0.08}>
            <h2 id="build-heading" className="mt-6 max-w-[16ch] font-display text-h2 font-medium text-paper">
              The boring parts, done right.
            </h2>
          </Reveal>
          <Reveal delay={0.16}>
            <p className="mt-5 max-w-lg text-body-lg text-paper/70">
              Money bugs come from shortcuts. These are the four we refused to take.
            </p>
          </Reveal>

          <Reveal delay={0.24}>
            <ul className="mt-9 space-y-5">
              {points.map((point) => (
                <li key={point} className="flex items-start gap-3">
                  <span className="mt-0.5 inline-flex size-5 shrink-0 items-center justify-center rounded-full bg-bright text-paper">
                    <Check className="size-3" aria-hidden />
                  </span>
                  <span className="max-w-md text-body-base text-paper/75">{point}</span>
                </li>
              ))}
            </ul>
          </Reveal>

          <Reveal delay={0.32}>
            <div className="mt-10">
              <Button href="/security" variant="light" size="lg">
                Read how it is secured
              </Button>
            </div>
          </Reveal>
        </div>

        <Reveal delay={0.16} scale>
          <CodeWindow tabs={tabs} statusLabel="200 OK · answered in 38 ms" />
        </Reveal>
      </div>
    </section>
  );
}
