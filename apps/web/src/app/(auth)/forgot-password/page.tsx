'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { MailCheck } from 'lucide-react';
import { forgotPasswordSchema } from '@tenzopay/shared';
import { api } from '@/lib/api';
import { Button } from '@/components/marketing/ui/button';
import { Alert, Field, Input } from '@/components/marketing/ui/form';

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
        <span className="inline-flex size-12 items-center justify-center rounded-full bg-mint text-forest">
          <MailCheck className="size-5" aria-hidden />
        </span>
        <h1 className="mt-6 font-display text-[2rem] font-medium leading-[1.1] tracking-[-0.02em] text-forest">
          Check your email
        </h1>
        <p className="mt-3 text-body-base leading-relaxed text-moss">
          If an account exists for that address, we have sent a link to reset your password.
        </p>

        {devToken ? (
          <Alert tone="brand" title="Development mode" className="mt-6">
            <p className="mb-2">
              No mail transport is configured in this build, so the reset link is shown here instead
              of being sent.
            </p>
            <Link
              href={`/reset-password?token=${devToken}`}
              className="break-all font-medium text-forest underline underline-offset-4"
            >
              Continue to reset password
            </Link>
          </Alert>
        ) : null}

        <Link
          href="/login"
          className="mt-8 inline-block rounded text-[0.9375rem] font-medium text-forest underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bright"
        >
          Back to sign in
        </Link>
      </>
    );
  }

  return (
    <>
      <h1 className="font-display text-[2rem] font-medium leading-[1.1] tracking-[-0.02em] text-forest">
        Reset your password
      </h1>
      <p className="mt-3 text-body-base text-moss">
        Enter your email and we will send you a reset link.
      </p>

      <form onSubmit={handleSubmit(onSubmit)} className="mt-8 space-y-5" noValidate>
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

        <Button type="submit" size="lg" className="w-full" loading={isSubmitting}>
          Send reset link
        </Button>
      </form>

      <Link
        href="/login"
        className="mt-8 inline-block rounded text-[0.9375rem] font-medium text-forest underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bright"
      >
        Back to sign in
      </Link>
    </>
  );
}
