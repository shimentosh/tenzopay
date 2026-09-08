import { cookies } from 'next/headers';
import { API_URL } from './api';

/**
 * Server-side API access for React Server Components.
 *
 * The browser's httpOnly cookies are not automatically attached to fetches made
 * from the server, so they are forwarded explicitly. Nothing is cached: these
 * responses are per-user and often financial.
 */
export async function serverFetch<T>(path: string): Promise<T | null> {
  const cookieStore = await cookies();
  const header = cookieStore
    .getAll()
    .map((c) => `${c.name}=${c.value}`)
    .join('; ');

  try {
    const response = await fetch(`${API_URL}/api${path}`, {
      headers: { cookie: header },
      cache: 'no-store',
    });

    if (!response.ok) return null;
    return (await response.json()) as T;
  } catch {
    // The API being down should render an empty state, not a crashed page.
    return null;
  }
}
