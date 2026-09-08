'use client';

import Link from 'next/link';
import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import { resetPasswordSchema } from '@tenzopay/shared';
import { api, ApiError } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Alert, Field, Input } from '@/components/ui/primitives';

type FormValues = { token: string; password: string };

function ResetForm() {
  const router = useRouter();
  const params = useSearchParams();
  const token = params.get('token') ?? '';
  const [formError, setFormError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: { token },
  });

  async function onSubmit(values: FormValues) {
    setFormError(null);
    try {
      await api.post('/auth/reset-password', values);
      toast.success('Password updated. Please sign in.');
      router.replace('/login');
    } catch (error) {
      setFormError(
        error instanceof ApiError
          ? error.message
          : 'We could not reset your password. Please try again.',
      );
    }
  }

  if (!token) {
    return (
      <>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          Link not valid
        </h1>
        <p className="mt-1.5 text-sm text-muted-foreground">
          This reset link is missing or malformed. Request a new one.
        </p>
        <Button asChild className="mt-6 w-full">
          <Link href="/forgot-password">Request a new link</Link>
        </Button>
      </>
    );
  }

  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight text-foreground">
        Choose a new password
      </h1>
      <p className="mt-1.5 text-sm text-muted-foreground">
        Signing in again will be required on all your devices.
      </p>

      {formError ? (
        <Alert tone="critical" className="mt-5">
          {formError}
        </Alert>
      ) : null}

      <form onSubmit={handleSubmit(onSubmit)} className="mt-6 space-y-4" noValidate>
        <input type="hidden" {...register('token')} />

        <Field
          label="New password"
          htmlFor="password"
          error={errors.password?.message}
          hint="At least 12 characters, with upper and lower case and a number."
        >
          <Input
            id="password"
            type="password"
            autoComplete="new-password"
            invalid={!!errors.password}
            {...register('password')}
          />
        </Field>

        <Button type="submit" className="w-full" loading={isSubmitting}>
          Update password
        </Button>
      </form>
    </>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense>
      <ResetForm />
    </Suspense>
  );
}
