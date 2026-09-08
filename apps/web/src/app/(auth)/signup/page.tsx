'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { Check } from 'lucide-react';
import { registerSchema, type RegisterInput } from '@tenzopay/shared';
import { api, ApiError } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Alert, Field, Input } from '@/components/ui/primitives';
import { cn } from '@/lib/utils';

/** Live requirements list — feedback while typing beats a rejection on submit. */
const rules = [
  { label: 'At least 12 characters', test: (v: string) => v.length >= 12 },
  { label: 'An uppercase letter', test: (v: string) => /[A-Z]/.test(v) },
  { label: 'A lowercase letter', test: (v: string) => /[a-z]/.test(v) },
  { label: 'A number', test: (v: string) => /\d/.test(v) },
];

export default function SignupPage() {
  const router = useRouter();
  const [formError, setFormError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<RegisterInput>({ resolver: zodResolver(registerSchema) });

  const password = watch('password') ?? '';

  async function onSubmit(values: RegisterInput) {
    setFormError(null);
    try {
      await api.post('/auth/register', values);
      router.replace('/onboarding');
      router.refresh();
    } catch (error) {
      setFormError(
        error instanceof ApiError
          ? error.message
          : 'We could not create your account. Please try again.',
      );
    }
  }

  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight text-foreground">
        Create your account
      </h1>
      <p className="mt-1.5 text-sm text-muted-foreground">
        One balance, as many cards as you need.
      </p>

      {formError ? (
        <Alert tone="critical" className="mt-5">
          {formError}
        </Alert>
      ) : null}

      <form onSubmit={handleSubmit(onSubmit)} className="mt-6 space-y-4" noValidate>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="First name" htmlFor="firstName" error={errors.firstName?.message}>
            <Input
              id="firstName"
              autoComplete="given-name"
              invalid={!!errors.firstName}
              {...register('firstName')}
            />
          </Field>
          <Field label="Last name" htmlFor="lastName" error={errors.lastName?.message}>
            <Input
              id="lastName"
              autoComplete="family-name"
              invalid={!!errors.lastName}
              {...register('lastName')}
            />
          </Field>
        </div>

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

        <Field label="Password" htmlFor="password" error={errors.password?.message}>
          <Input
            id="password"
            type="password"
            autoComplete="new-password"
            invalid={!!errors.password}
            {...register('password')}
          />
        </Field>

        <ul className="space-y-1.5" aria-label="Password requirements">
          {rules.map((rule) => {
            const met = rule.test(password);
            return (
              <li key={rule.label} className="flex items-center gap-2 text-xs">
                <span
                  className={cn(
                    'flex size-4 items-center justify-center rounded-full transition-colors',
                    met ? 'bg-positive text-white' : 'bg-border text-transparent',
                  )}
                  aria-hidden
                >
                  <Check className="size-2.5" strokeWidth={3} />
                </span>
                <span className={met ? 'text-foreground/80' : 'text-muted-foreground'}>
                  {rule.label}
                </span>
                <span className="sr-only">{met ? '(met)' : '(not met)'}</span>
              </li>
            );
          })}
        </ul>

        <Button type="submit" className="w-full" loading={isSubmitting}>
          Create account
        </Button>

        <p className="text-xs leading-relaxed text-muted-foreground">
          By continuing you agree to our terms and acknowledge that TenzoPay is
          a demonstration product operating in sandbox mode.
        </p>
      </form>

      <p className="mt-6 text-sm text-muted-foreground">
        Already have an account?{' '}
        <Link href="/login" className="font-medium text-primary hover:underline">
          Sign in
        </Link>
      </p>
    </>
  );
}
