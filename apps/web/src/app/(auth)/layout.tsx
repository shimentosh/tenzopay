import Link from 'next/link';
import { Logo } from '@/components/logo';

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="grid min-h-dvh lg:grid-cols-2">
      <div className="flex flex-col px-5 py-8 sm:px-10">
        <Link href="/" aria-label="TenzoPay home">
          <Logo />
        </Link>
        <main id="main" className="flex flex-1 items-center justify-center py-10">
          <div className="w-full max-w-sm">{children}</div>
        </main>
        <p className="text-xs text-muted-foreground">
          © {new Date().getFullYear()} TenzoPay
        </p>
      </div>

      {/* Decorative panel — hidden from assistive tech, purely atmosphere. */}
      <aside
        aria-hidden
        className="relative hidden overflow-hidden bg-ink-950 lg:block"
      >
        <div className="absolute inset-0 bg-[radial-gradient(90%_70%_at_75%_15%,var(--color-brand-900),transparent_65%)]" />
        <div className="absolute -right-24 top-1/4 size-[420px] rounded-full border border-white/[0.06]" />
        <div className="absolute -left-32 bottom-0 size-[520px] rounded-full border border-white/[0.04]" />

        <div className="relative flex h-full flex-col justify-end p-12">
          <blockquote className="max-w-md">
            <p className="text-2xl font-medium leading-snug text-white">
              One balance. Every card. Every movement recorded.
            </p>
            <footer className="mt-4 text-sm text-white/50">
              Set a limit per card, freeze one in a tap, and see exactly where
              each unit went.
            </footer>
          </blockquote>
        </div>
      </aside>
    </div>
  );
}
