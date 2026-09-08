'use client';

import Link from 'next/link';
import { Suspense, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { BadgeCheck, Loader2, XCircle } from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/primitives';

type State = 'verifying' | 'done' | 'failed' | 'missing';

function VerifyEmail() {
  const params = useSearchParams();
  const token = params.get('token') ?? '';
  const [state, setState] = useState<State>(token ? 'verifying' : 'missing');
  const [message, setMessage] = useState<string | null>(null);
  // React runs effects twice in development strict mode; verifying twice would
  // consume the single-use token and show a spurious failure.
  const attempted = useRef(false);

  useEffect(() => {
    if (!token || attempted.current) return;
    attempted.current = true;

    api
      .post('/auth/verify-email', { token })
      .then(() => setState('done'))
      .catch((error: unknown) => {
        setMessage(
          error instanceof ApiError
            ? error.message
            : 'We could not verify this link.',
        );
        setState('failed');
      });
  }, [token]);

  if (state === 'verifying') {
    return (
      <div className="text-center">
        <Loader2 className="mx-auto size-7 animate-spin text-primary" aria-hidden />
        <h1 className="mt-4 text-2xl font-semibold tracking-tight text-foreground">
          Verifying your email
        </h1>
        <p className="mt-1.5 text-sm text-muted-foreground">One moment…</p>
      </div>
    );
  }

  if (state === 'done') {
    return (
      <div className="text-center">
        <BadgeCheck className="mx-auto size-8 text-positive" aria-hidden />
        <h1 className="mt-4 text-2xl font-semibold tracking-tight text-foreground">
          Email verified
        </h1>
        <p className="mt-1.5 text-sm text-muted-foreground">
          Your account is confirmed. You can sign in now.
        </p>
        <Button asChild className="mt-6 w-full">
          <Link href="/login">Continue to sign in</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="text-center">
      <XCircle className="mx-auto size-8 text-destructive" aria-hidden />
      <h1 className="mt-4 text-2xl font-semibold tracking-tight text-foreground">
        {state === 'missing' ? 'Link not valid' : 'Verification failed'}
      </h1>
      <p className="mt-1.5 text-sm text-muted-foreground">
        {state === 'missing'
          ? 'This verification link is missing or malformed.'
          : (message ?? 'This link is invalid or has already been used.')}
      </p>

      <Alert tone="brand" className="mt-5 text-left">
        Verification links can only be used once. If you have already verified,
        simply sign in.
      </Alert>

      <Button asChild variant="secondary" className="mt-5 w-full">
        <Link href="/login">Back to sign in</Link>
      </Button>
    </div>
  );
}

export default function VerifyPage() {
  return (
    <Suspense>
      <VerifyEmail />
    </Suspense>
  );
}
