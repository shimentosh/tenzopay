import { Hero } from '@/components/marketing/sections/hero';
import { LogoMarquee } from '@/components/marketing/sections/logo-marquee';
import { ProductPreview } from '@/components/marketing/sections/product-preview';
import { Pillars } from '@/components/marketing/sections/pillars';
import { Bento } from '@/components/marketing/sections/bento';
import { Reach } from '@/components/marketing/sections/reach';
import { HowItWorks } from '@/components/marketing/sections/how-it-works';
import { UseCases } from '@/components/marketing/sections/use-cases';
import { CardShowcase } from '@/components/marketing/sections/card-showcase';
import { Build } from '@/components/marketing/sections/build';
import { Pricing } from '@/components/marketing/sections/pricing';
import { Trust } from '@/components/marketing/sections/trust';
import { Principles } from '@/components/marketing/sections/principles';
import { Faq } from '@/components/marketing/sections/faq';
import { FinalCta } from '@/components/marketing/sections/final-cta';

export default function HomePage() {
  return (
    <>
      <Hero />
      <LogoMarquee />
      <ProductPreview />
      <Pillars />
      <Bento />
      <Reach />
      <HowItWorks />
      <UseCases />
      <CardShowcase />
      <Build />
      <Pricing />
      <Trust />
      <Principles />
      <Faq />
      <FinalCta />
    </>
  );
}
