import { redirect } from 'next/navigation';
import { AppShell } from '@/components/app/app-shell';
import { serverFetch } from '@/lib/server-api';
import type { SessionUser } from '@tenzopay/shared';

interface RuntimeConfig {
  appEnv: string;
  depositMode: string;
  cardProvider: string;
  blockchainProvider: string;
}

interface MeResponse extends SessionUser {
  kycStatus: SessionUser['kycStatus'];
}

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // The session is checked on the server on every request, so a stale client
  // cannot render the dashboard shell for a signed-out or frozen account.
  const [user, config] = await Promise.all([
    serverFetch<MeResponse>('/auth/me'),
    serverFetch<RuntimeConfig>('/config'),
  ]);

  if (!user) redirect('/login');

  // The environment banner is rendered on the server so a sandbox or demo
  // warning is present in the very first byte, never dependent on hydration.
  return (
    <AppShell user={user} config={config ?? undefined}>
      {children}
    </AppShell>
  );
}
