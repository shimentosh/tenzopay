'use client';

import { Suspense, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { BadgeCheck, Loader2, XCircle } from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import { Button } from '@/components/marketing/ui/button';
import { Alert } from '@/components/marketing/ui/form';

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
        <span className="inline-flex size-12 items-center justify-center rounded-full bg-mint text-forest">
          <Loader2 className="size-5 animate-spin" aria-hidden />
        </span>
        <h1 className="mt-6 font-display text-[2rem] font-medium leading-[1.1] tracking-[-0.02em] text-forest">
          Verifying your email
        </h1>
        <p className="mt-3 text-body-base text-moss">One moment…</p>
      </div>
    );
  }

  if (state === 'done') {
    return (
      <div className="text-center">
        <span className="inline-flex size-12 items-center justify-center rounded-full bg-bright text-paper">
          <BadgeCheck className="size-6" aria-hidden />
        </span>
        <h1 className="mt-6 font-display text-[2rem] font-medium leading-[1.1] tracking-[-0.02em] text-forest">
          Email verified
        </h1>
        <p className="mt-3 text-body-base text-moss">
          Your account is confirmed. You can sign in now.
        </p>
        <div className="mt-8">
          <Button href="/login" size="lg" className="w-full">
            Continue to sign in
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="text-center">
      <span className="inline-flex size-12 items-center justify-center rounded-full bg-rust/10 text-rust">
        <XCircle className="size-6" aria-hidden />
      </span>
      <h1 className="mt-6 font-display text-[2rem] font-medium leading-[1.1] tracking-[-0.02em] text-forest">
        {state === 'missing' ? 'Link not valid' : 'Verification failed'}
      </h1>
      <p className="mt-3 text-body-base text-moss">
        {state === 'missing'
          ? 'This verification link is missing or malformed.'
          : (message ?? 'This link is invalid or has already been used.')}
      </p>

      <Alert tone="brand" className="mt-6 text-left">
        Verification links can only be used once. If you have already verified, simply sign in.
      </Alert>

      <div className="mt-6">
        <Button href="/login" variant="secondary" size="lg" className="w-full">
          Back to sign in
        </Button>
      </div>
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
