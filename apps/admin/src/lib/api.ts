import type { ApiErrorBody } from '@tenzopay/shared';

/**
 * API client.
 *
 * Auth rides on httpOnly cookies, so every request sets `credentials:
 * 'include'` and no token is ever handled in JavaScript — that is the point of
 * httpOnly, and it is why XSS here cannot lift a session.
 *
 * On a 401 the client transparently attempts one refresh and replays the
 * request. One attempt only: a refresh loop against an expired session would
 * hammer the API.
 */

export const API_URL =
  process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:1222';

export class ApiError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status: number,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

interface RequestOptions extends Omit<RequestInit, 'body'> {
  body?: unknown;
  /** Internal: prevents infinite refresh recursion. */
  _retried?: boolean;
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { body, _retried, headers, ...rest } = options;

  const response = await fetch(`${API_URL}/api${path}`, {
    ...rest,
    credentials: 'include',
    headers: {
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...headers,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  if (response.status === 401 && !_retried && !path.startsWith('/auth/')) {
    const refreshed = await fetch(`${API_URL}/api/auth/refresh`, {
      method: 'POST',
      credentials: 'include',
    });

    if (refreshed.ok) {
      return request<T>(path, { ...options, _retried: true });
    }
  }

  if (response.status === 204) return undefined as T;

  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    const error = (payload ?? {}) as ApiErrorBody;
    throw new ApiError(
      error.code ?? 'UNKNOWN',
      // Server messages are already safe for display — see AllExceptionsFilter.
      error.message ?? 'Something went wrong. Please try again.',
      response.status,
      error.details,
    );
  }

  return payload as T;
}

export const api = {
  get: <T>(path: string, init?: RequestOptions) =>
    request<T>(path, { ...init, method: 'GET' }),
  post: <T>(path: string, body?: unknown, init?: RequestOptions) =>
    request<T>(path, { ...init, method: 'POST', body }),
  patch: <T>(path: string, body?: unknown, init?: RequestOptions) =>
    request<T>(path, { ...init, method: 'PATCH', body }),
  delete: <T>(path: string, init?: RequestOptions) =>
    request<T>(path, { ...init, method: 'DELETE' }),
};
