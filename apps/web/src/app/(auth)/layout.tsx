import Link from 'next/link';
import { Inter_Tight } from 'next/font/google';
import { Check } from 'lucide-react';
import { SITE } from '@/lib/marketing';
import { BrandWordmark } from '@/components/marketing/ui/wordmarks';
import { CardMockup } from '@/components/marketing/ui/card-mockup';
import { Reveal } from '@/components/marketing/ui/reveal';

const interTight = Inter_Tight({
  subsets: ['latin'],
  variable: '--font-inter-tight',
  display: 'swap',
});

const proof = [
  'A card per merchant, each with its own ceiling',
  'Freeze one in a tap — the network hears about it, not just this app',
  'Every movement is a balanced entry you can read back',
];

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className={`${interTight.variable} grid min-h-dvh bg-paper lg:grid-cols-[1fr_1.05fr]`}>
      <div className="flex flex-col px-6 py-8 sm:px-10">
        <Link
          href="/"
          aria-label={SITE.brand + ' home'}
          className="inline-flex w-fit rounded-full text-forest focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bright focus-visible:ring-offset-2"
        >
          <BrandWordmark />
        </Link>

        <main id="main" className="flex flex-1 items-center justify-center py-12">
          <div className="w-full max-w-[26rem]">{children}</div>
        </main>

        <div className="flex flex-wrap items-center justify-between gap-3 text-[0.75rem] text-moss">
          <p>
            © {new Date().getFullYear()} {SITE.brand}
          </p>
          <p>A preview on sandbox rails. No real funds are held.</p>
        </div>
      </div>

      {/* Atmosphere only — the same story the landing tells, without repeating it. */}
      <aside aria-hidden className="relative hidden overflow-hidden bg-forest p-12 lg:flex lg:flex-col lg:justify-between">
        <div className="pointer-events-none absolute -right-24 top-8 size-[26rem] rounded-full border border-paper/[0.07]" />
        <div className="pointer-events-none absolute -left-28 bottom-0 size-[32rem] rounded-full border border-paper/[0.05]" />
        <div className="pointer-events-none absolute -right-10 top-1/3 size-[22rem] rounded-full bg-bright/10 blur-3xl" />

        <Reveal>
          <p className="max-w-md font-display text-[clamp(1.75rem,2.4vw,2.5rem)] font-medium leading-[1.1] tracking-[-0.02em] text-paper">
            One balance. Every card. Every movement recorded.
          </p>
        </Reveal>

        <Reveal delay={0.12} className="relative my-10">
          <div className="relative mx-auto w-full max-w-[22rem]">
            <div className="absolute inset-0 -rotate-6 opacity-70">
              <CardMockup tone="ink" last4="6034" holder="TRAVEL" expiry="11/29" />
            </div>
            <div className="relative rotate-3">
              <CardMockup tone="bright" last4="5528" holder="GOOGLE ADS" expiry="09/29" className="shadow-float" />
            </div>
          </div>
        </Reveal>

        <Reveal delay={0.2}>
          <ul className="space-y-4">
            {proof.map((item) => (
              <li key={item} className="flex items-start gap-3">
                <span className="mt-0.5 inline-flex size-5 shrink-0 items-center justify-center rounded-full bg-bright text-forest">
                  <Check className="size-3" />
                </span>
                <span className="max-w-sm text-[0.9375rem] leading-relaxed text-paper/70">{item}</span>
              </li>
            ))}
          </ul>
        </Reveal>
      </aside>
    </div>
  );
}
