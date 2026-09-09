'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { Check } from 'lucide-react';
import { registerSchema, type RegisterInput } from '@tenzopay/shared';
import { api, ApiError } from '@/lib/api';
import { Button } from '@/components/marketing/ui/button';
import { Alert, Field, Input } from '@/components/marketing/ui/form';
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
      <h1 className="font-display text-[2rem] font-medium leading-[1.1] tracking-[-0.02em] text-forest">
        Create your account
      </h1>
      <p className="mt-3 text-body-base text-moss">
        One balance, as many cards as you need.
      </p>

      {formError ? (
        <Alert tone="critical" className="mt-6">
          {formError}
        </Alert>
      ) : null}

      <form onSubmit={handleSubmit(onSubmit)} className="mt-8 space-y-5" noValidate>
        <div className="grid gap-5 sm:grid-cols-2">
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

        <ul className="grid gap-2 sm:grid-cols-2" aria-label="Password requirements">
          {rules.map((rule) => {
            const met = rule.test(password);
            return (
              <li key={rule.label} className="flex items-center gap-2 text-[0.8125rem]">
                <span
                  className={cn(
                    'flex size-4 items-center justify-center rounded-full transition-colors duration-200',
                    met ? 'bg-bright text-paper' : 'bg-edge text-transparent',
                  )}
                  aria-hidden
                >
                  <Check className="size-2.5" strokeWidth={3} />
                </span>
                <span className={met ? 'text-forest' : 'text-moss'}>{rule.label}</span>
                <span className="sr-only">{met ? '(met)' : '(not met)'}</span>
              </li>
            );
          })}
        </ul>

        <Button type="submit" size="lg" className="w-full" loading={isSubmitting}>
          Create account
        </Button>

        <p className="text-[0.8125rem] leading-relaxed text-moss">
          By continuing you agree to our terms and acknowledge that TenzoPay is a demonstration
          product operating in sandbox mode.
        </p>
      </form>

      <p className="mt-8 text-[0.9375rem] text-moss">
        Already have an account?{' '}
        <Link
          href="/login"
          className="rounded font-medium text-forest underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bright"
        >
          Sign in
        </Link>
      </p>
    </>
  );
}
