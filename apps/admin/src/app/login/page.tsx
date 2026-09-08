'use client';

import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { useState } from 'react';
import { ShieldCheck } from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Alert, Field, Input } from '@/components/ui/primitives';
import { Logo } from '@/components/logo';

interface FormValues {
  email: string;
  password: string;
}

export default function AdminLoginPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { isSubmitting },
  } = useForm<FormValues>();

  async function onSubmit(values: FormValues) {
    setError(null);
    try {
      await api.post('/auth/admin/login', values);
      router.replace('/');
      router.refresh();
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : 'Sign in failed. Please try again.',
      );
    }
  }

  return (
    <div className="flex min-h-dvh items-center justify-center bg-ink-950 px-5">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center text-center">
          <Logo inverted showWordmark={false} />
          <h1 className="mt-4 text-xl font-semibold text-white">
            Operations Console
          </h1>
          <p className="mt-1 text-sm text-white/50">
            Staff access only. All actions are recorded.
          </p>
        </div>

        <main id="main" className="rounded-2xl bg-card p-6 shadow-xl">
          {error ? (
            <Alert tone="critical" className="mb-4">
              {error}
            </Alert>
          ) : null}

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
            <Field label="Email" htmlFor="email">
              <Input
                id="email"
                type="email"
                autoComplete="email"
                placeholder="admin@tenzopay.dev"
                {...register('email', { required: true })}
              />
            </Field>

            <Field label="Password" htmlFor="password">
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                {...register('password', { required: true })}
              />
            </Field>

            <Button type="submit" className="w-full" loading={isSubmitting}>
              Sign in
            </Button>
          </form>

          <p className="mt-5 flex items-start gap-2 text-xs leading-relaxed text-muted-foreground">
            <ShieldCheck className="mt-px size-3.5 shrink-0 text-positive" aria-hidden />
            This console runs on its own origin and session, separate from the
            customer application.
          </p>
        </main>
      </div>
    </div>
  );
}
