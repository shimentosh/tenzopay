'use client';

import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { BadgeCheck, ShieldCheck } from 'lucide-react';
import { kycSubmitSchema, type KycSubmitInput } from '@tenzopay/shared';
import { api, ApiError } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Alert, Field, Input, Panel, Skeleton } from '@/components/ui/primitives';

export default function OnboardingPage() {
  const router = useRouter();
  const [formError, setFormError] = useState<string | null>(null);

  const { data: status, isLoading, refetch } = useQuery({
    queryKey: ['kyc-status'],
    queryFn: () => api.get<{ status: string; reasons: string[] }>('/kyc/status'),
  });

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<KycSubmitInput>({
    resolver: zodResolver(kycSubmitSchema),
    defaultValues: { country: 'USA' },
  });

  async function onSubmit(values: KycSubmitInput) {
    setFormError(null);
    try {
      const result = await api.post<{ status: string }>('/kyc/submit', values);
      await refetch();
      if (result.status === 'ACCEPTED') {
        router.replace('/dashboard');
        router.refresh();
      }
    } catch (error) {
      setFormError(
        error instanceof ApiError
          ? error.message
          : 'We could not submit your details. Please try again.',
      );
    }
  }

  if (isLoading) {
    return (
      <div className="mx-auto max-w-2xl space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  if (status?.status === 'ACCEPTED') {
    return (
      <div className="mx-auto max-w-2xl">
        <Panel className="p-8 text-center">
          <BadgeCheck className="mx-auto size-8 text-positive" aria-hidden />
          <h1 className="mt-4 text-xl font-semibold text-foreground">
            You are verified
          </h1>
          <p className="mt-1.5 text-sm text-muted-foreground">
            You can now deposit funds and issue cards.
          </p>
          <Button className="mt-6" onClick={() => router.push('/dashboard')}>
            Go to dashboard
          </Button>
        </Panel>
      </div>
    );
  }

  if (status?.status === 'PENDING_REVIEW' || status?.status === 'PENDING_DOCUMENT') {
    return (
      <div className="mx-auto max-w-2xl">
        <Panel className="p-8 text-center">
          <ShieldCheck className="mx-auto size-8 text-warning" aria-hidden />
          <h1 className="mt-4 text-xl font-semibold text-foreground">
            Verification in review
          </h1>
          <p className="mt-1.5 text-sm text-muted-foreground">
            We are reviewing your details. This usually takes a short while, and
            we will update you as soon as there is a decision.
          </p>
          {status.reasons.length ? (
            <ul className="mt-4 space-y-1 text-sm text-muted-foreground">
              {status.reasons.map((reason) => (
                <li key={reason}>{reason.replace(/_/g, ' ').toLowerCase()}</li>
              ))}
            </ul>
          ) : null}
        </Panel>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="text-2xl font-semibold tracking-tight text-foreground">
        Verify your identity
      </h1>
      <p className="mt-1.5 text-sm text-muted-foreground">
        Card issuing is regulated, so we need to confirm who you are before you
        can deposit or spend.
      </p>

      {status?.status === 'REJECTED' ? (
        <Alert tone="critical" title="Verification was not successful" className="mt-5">
          We could not verify these details. Check them and try again, or
          contact support.
        </Alert>
      ) : null}

      {formError ? (
        <Alert tone="critical" className="mt-5">
          {formError}
        </Alert>
      ) : null}

      <Alert tone="brand" title="Sandbox mode" className="mt-5">
        This build uses the card issuer&rsquo;s sandbox. Use test details only —
        never a real government ID number.
      </Alert>

      <Panel className="mt-5 p-6">
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="First name" htmlFor="firstName" error={errors.firstName?.message}>
              <Input id="firstName" invalid={!!errors.firstName} {...register('firstName')} />
            </Field>
            <Field label="Last name" htmlFor="lastName" error={errors.lastName?.message}>
              <Input id="lastName" invalid={!!errors.lastName} {...register('lastName')} />
            </Field>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Date of birth" htmlFor="dob" error={errors.dob?.message} hint="YYYY-MM-DD">
              <Input id="dob" placeholder="1991-03-08" invalid={!!errors.dob} {...register('dob')} />
            </Field>
            <Field
              label="Phone number"
              htmlFor="phoneNumber"
              error={errors.phoneNumber?.message}
              hint="Include the country code"
            >
              <Input
                id="phoneNumber"
                placeholder="+15555550142"
                invalid={!!errors.phoneNumber}
                {...register('phoneNumber')}
              />
            </Field>
          </div>

          <Field label="Email" htmlFor="kycEmail" error={errors.email?.message}>
            <Input id="kycEmail" type="email" invalid={!!errors.email} {...register('email')} />
          </Field>

          <Field
            label="Government ID"
            htmlFor="governmentId"
            error={errors.governmentId?.message}
            hint="Sandbox test value, e.g. 111-23-1234. Never a real number."
          >
            <Input
              id="governmentId"
              placeholder="111-23-1234"
              autoComplete="off"
              invalid={!!errors.governmentId}
              {...register('governmentId')}
            />
          </Field>

          <Field label="Address" htmlFor="address1" error={errors.address1?.message}>
            <Input id="address1" placeholder="123 Main St" invalid={!!errors.address1} {...register('address1')} />
          </Field>

          <Field label="Apartment, suite (optional)" htmlFor="address2" error={errors.address2?.message}>
            <Input id="address2" {...register('address2')} />
          </Field>

          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="City" htmlFor="city" error={errors.city?.message}>
              <Input id="city" placeholder="Austin" invalid={!!errors.city} {...register('city')} />
            </Field>
            <Field label="State" htmlFor="state" error={errors.state?.message} hint="2 letters">
              <Input id="state" placeholder="TX" maxLength={2} invalid={!!errors.state} {...register('state')} />
            </Field>
            <Field label="ZIP code" htmlFor="postalCode" error={errors.postalCode?.message}>
              <Input id="postalCode" placeholder="78701" invalid={!!errors.postalCode} {...register('postalCode')} />
            </Field>
          </div>

          <input type="hidden" {...register('country')} />

          <div className="flex justify-end pt-2">
            <Button type="submit" loading={isSubmitting}>
              Submit for verification
            </Button>
          </div>
        </form>
      </Panel>
    </div>
  );
}
