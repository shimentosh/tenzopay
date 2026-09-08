import { Marquee } from '@/components/marketing/ui/marquee';
import { Reveal } from '@/components/marketing/ui/reveal';
import { MerchantWordmark, merchantMarks } from '@/components/marketing/ui/wordmarks';

export function LogoMarquee() {
  return (
    <section aria-labelledby="marquee-heading" className="border-y border-edge bg-paper py-20">
      <div className="mx-auto w-full max-w-container px-6 md:px-8">
        <Reveal>
          <h2 id="marquee-heading" className="text-center text-micro font-medium uppercase text-moss">
            Name a card after the thing it pays for
          </h2>
        </Reveal>
      </div>

      <Reveal delay={0.08} className="mt-10">
        <Marquee duration={40}>
          {merchantMarks.map((mark) => (
            <span
              key={mark.name}
              className="text-forest/40 transition-colors duration-200 hover:text-forest"
            >
              <MerchantWordmark mark={mark} />
            </span>
          ))}
        </Marquee>
      </Reveal>

      <div className="mx-auto mt-10 w-full max-w-container px-6 md:px-8">
        <Reveal delay={0.16}>
          <p className="mx-auto max-w-xl text-center text-[0.8125rem] text-moss">
            Examples of what people label a card, not partners or integrations. A card works
            wherever its network is accepted.
          </p>
        </Reveal>
      </div>
    </section>
  );
}
