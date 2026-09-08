'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { MailCheck } from 'lucide-react';
import { forgotPasswordSchema } from '@tenzopay/shared';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Alert, Field, Input } from '@/components/ui/primitives';

type FormValues = { email: string };

export default function ForgotPasswordPage() {
  const [sent, setSent] = useState(false);
  const [devToken, setDevToken] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(forgotPasswordSchema) });

  async function onSubmit(values: FormValues) {
    // The API answers identically whether or not the account exists, so this
    // page cannot be used to discover which emails are registered.
    const result = await api
      .post<{ ok: boolean; resetToken?: string }>('/auth/forgot-password', values)
      .catch(() => ({ ok: true, resetToken: undefined }));

    setDevToken(result.resetToken ?? null);
    setSent(true);
  }

  if (sent) {
    return (
      <>
        <MailCheck className="size-7 text-primary" aria-hidden />
        <h1 className="mt-4 text-2xl font-semibold tracking-tight text-foreground">
          Check your email
        </h1>
        <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
          If an account exists for that address, we have sent a link to reset
          your password.
        </p>

        {devToken ? (
          <Alert tone="brand" title="Development mode" className="mt-5">
            <p className="mb-2">
              No mail transport is configured in this build, so the reset link
              is shown here instead of being sent.
            </p>
            <Link
              href={`/reset-password?token=${devToken}`}
              className="font-medium text-primary underline break-all"
            >
              Continue to reset password
            </Link>
          </Alert>
        ) : null}

        <Link
          href="/login"
          className="mt-6 inline-block text-sm font-medium text-primary hover:underline"
        >
          Back to sign in
        </Link>
      </>
    );
  }

  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight text-foreground">
        Reset your password
      </h1>
      <p className="mt-1.5 text-sm text-muted-foreground">
        Enter your email and we will send you a reset link.
      </p>

      <form onSubmit={handleSubmit(onSubmit)} className="mt-6 space-y-4" noValidate>
        <Field label="Email" htmlFor="email" error={errors.email?.message}>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            placeholder="you@company.com"
            invalid={!!errors.email}
            {...register('email')}
          />
        </Field>

        <Button type="submit" className="w-full" loading={isSubmitting}>
          Send reset link
        </Button>
      </form>

      <Link
        href="/login"
        className="mt-6 inline-block text-sm font-medium text-primary hover:underline"
      >
        Back to sign in
      </Link>
    </>
  );
}
