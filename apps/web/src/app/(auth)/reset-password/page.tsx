'use client';

import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import { resetPasswordSchema } from '@tenzopay/shared';
import { api, ApiError } from '@/lib/api';
import { Button } from '@/components/marketing/ui/button';
import { Alert, Field, Input } from '@/components/marketing/ui/form';

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
        <h1 className="font-display text-[2rem] font-medium leading-[1.1] tracking-[-0.02em] text-forest">
          Link not valid
        </h1>
        <p className="mt-3 text-body-base text-moss">
          This reset link is missing or malformed. Request a new one.
        </p>
        <div className="mt-8">
          <Button href="/forgot-password" size="lg" className="w-full">
            Request a new link
          </Button>
        </div>
      </>
    );
  }

  return (
    <>
      <h1 className="font-display text-[2rem] font-medium leading-[1.1] tracking-[-0.02em] text-forest">
        Choose a new password
      </h1>
      <p className="mt-3 text-body-base text-moss">
        Signing in again will be required on all your devices.
      </p>

      {formError ? (
        <Alert tone="critical" className="mt-6">
          {formError}
        </Alert>
      ) : null}

      <form onSubmit={handleSubmit(onSubmit)} className="mt-8 space-y-5" noValidate>
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

        <Button type="submit" size="lg" className="w-full" loading={isSubmitting}>
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
