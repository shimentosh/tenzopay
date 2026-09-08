import { Pill } from '@/components/marketing/ui/pill';
import { Marquee } from '@/components/marketing/ui/marquee';
import { Reveal } from '@/components/marketing/ui/reveal';

/**
 * This slot is where a testimonial wall would normally go. There are no
 * customers to quote yet, and inventing them would be a lie printed on the
 * front page — so it carries the rules the code enforces instead.
 */
const principles = [
  {
    rule: 'No cached balances',
    detail: 'Every balance is summed from ledger entries at read time. There is no column to drift out of date.',
  },
  {
    rule: 'Entries are immutable',
    detail: 'Nothing is updated or deleted. A mistake is corrected by a new balanced entry that says who and why.',
  },
  {
    rule: 'Every write is idempotent',
    detail: 'Financial writes carry a natural key, so replaying the same event returns the original result.',
  },
  {
    rule: 'Money reads are serializable',
    detail: 'Two cards on one balance cannot both be told yes. The isolation level makes the race impossible.',
  },
  {
    rule: 'Doubt means decline',
    detail: 'An error, a timeout or a card we do not recognise is declined. Nothing is approved on a failure path.',
  },
  {
    rule: 'The number is never ours',
    detail: 'Card numbers and CVVs are rendered by the issuer inside your browser. They never touch our servers or logs.',
  },
  {
    rule: 'Signatures, not string equality',
    detail: 'Webhooks are verified with a constant-time compare and a timestamp window before anything is read.',
  },
  {
    rule: 'Money is integers',
    detail: 'Amounts are minor units held as BigInt. No floating point value ever comes near a balance.',
  },
];

function PrincipleCard({ rule, detail }: { rule: string; detail: string }) {
  return (
    <article className="flex w-[19rem] shrink-0 flex-col rounded-3xl border border-edge bg-paper p-6 md:w-[23rem]">
      <span aria-hidden className="mb-5 h-1 w-10 rounded-full bg-bright" />
      <h3 className="font-display text-[1.0625rem] font-medium tracking-[-0.02em] text-forest">{rule}</h3>
      <p className="mt-3 text-[0.875rem] leading-relaxed text-moss">{detail}</p>
    </article>
  );
}

export function Principles() {
  return (
    <section aria-labelledby="principles-heading" className="overflow-hidden bg-sand py-24 md:py-32">
      <div className="mx-auto w-full max-w-container px-6 md:px-8">
        <div className="max-w-2xl">
          <Reveal>
            <Pill tone="light">Instead of testimonials</Pill>
          </Reveal>
          <Reveal delay={0.08}>
            <h2 id="principles-heading" className="mt-6 font-display text-h2 font-medium text-forest">
              Eight rules the code enforces.
            </h2>
          </Reveal>
          <Reveal delay={0.16}>
            <p className="mt-5 max-w-xl text-body-lg text-moss">
              We have no customers to quote yet, so here is what the build actually commits to
              instead.
            </p>
          </Reveal>
        </div>
      </div>

      <Reveal delay={0.24} className="mt-14 space-y-6">
        <Marquee gap="sm" duration={52}>
          {principles.slice(0, 4).map((item) => (
            <PrincipleCard key={item.rule} {...item} />
          ))}
        </Marquee>
        <Marquee gap="sm" duration={52} reverse>
          {principles.slice(4).map((item) => (
            <PrincipleCard key={item.rule} {...item} />
          ))}
        </Marquee>
      </Reveal>
    </section>
  );
}
