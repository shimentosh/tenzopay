import type { Metadata } from 'next';
import { Inter_Tight } from 'next/font/google';
import { Nav } from '@/components/marketing/sections/nav';
import { Footer } from '@/components/marketing/sections/footer';

/**
 * The landing page lives in its own route group so it can carry its own
 * chrome. The other marketing pages keep the shared header and footer in
 * `(marketing)/layout.tsx`; both groups still resolve at the same URL depth.
 */
const interTight = Inter_Tight({
  subsets: ['latin'],
  variable: '--font-inter-tight',
  display: 'swap',
});

export const metadata: Metadata = {
  title: { absolute: 'TenzoPay — One balance. Every card.' },
  description:
    'Issue virtual Visa cards in seconds, each with its own daily, monthly and per-transaction limit, all spending from one shared balance.',
  openGraph: {
    title: 'TenzoPay — One balance. Every card.',
    description:
      'Issue virtual Visa cards in seconds, each with its own limits, all spending from one shared balance.',
    type: 'website',
  },
  alternates: { canonical: '/' },
};

export default function HomeLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className={`${interTight.variable} flex min-h-dvh flex-col bg-paper`}>
      <Nav />
      <main id="main" className="flex-1">
        {children}
      </main>
      <Footer />
    </div>
  );
}
