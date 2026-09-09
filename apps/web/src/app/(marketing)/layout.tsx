import { Inter_Tight } from 'next/font/google';
import { Nav } from '@/components/marketing/sections/nav';
import { Footer } from '@/components/marketing/sections/footer';

/**
 * Shared chrome for every guest page except the landing, which lives in
 * `(home)` and composes the same Nav and Footer itself.
 */
const interTight = Inter_Tight({
  subsets: ['latin'],
  variable: '--font-inter-tight',
  display: 'swap',
});

export default function MarketingLayout({ children }: { children: React.ReactNode }) {
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
