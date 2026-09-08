import { redirect } from 'next/navigation';
import { ConsoleShell, type AdminIdentity } from '@/components/console-shell';
import { serverFetch } from '@/lib/server-api';

export default async function ConsoleLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Checked server-side on every request: revoking an admin takes effect on
  // their next navigation, not whenever their token happens to expire.
  const admin = await serverFetch<AdminIdentity>('/admin/me');

  if (!admin) redirect('/login');

  return <ConsoleShell admin={admin}>{children}</ConsoleShell>;
}
