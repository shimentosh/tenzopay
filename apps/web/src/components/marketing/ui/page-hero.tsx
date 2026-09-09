import { Pill } from '@/components/marketing/ui/pill';
import { Reveal } from '@/components/marketing/ui/reveal';

/**
 * Header for the non-landing guest pages. The top padding clears the fixed
 * nav, so pages never have to remember to leave room for it.
 */
export function PageHero({
  eyebrow,
  title,
  lead,
  children,
}: {
  eyebrow: string;
  title: string;
  lead: string;
  children?: React.ReactNode;
}) {
  return (
    <section className="border-b border-edge bg-bone pb-20 pt-[8.5rem] md:pb-24 md:pt-[10rem]">
      <div className="mx-auto w-full max-w-container px-6 md:px-8">
        <div className="max-w-3xl">
          <Reveal>
            <Pill tone="mint">{eyebrow}</Pill>
          </Reveal>
          <Reveal delay={0.08}>
            <h1 className="mt-7 font-display text-h1 font-medium text-forest">{title}</h1>
          </Reveal>
          <Reveal delay={0.16}>
            <p className="mt-7 max-w-2xl text-body-lg text-moss">{lead}</p>
          </Reveal>
          {children ? (
            <Reveal delay={0.24}>
              <div className="mt-9">{children}</div>
            </Reveal>
          ) : null}
        </div>
      </div>
    </section>
  );
}
