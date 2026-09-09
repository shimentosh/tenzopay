'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Check } from 'lucide-react';
import { createCardSchema, type CreateCardInput, type CardSummary } from '@tenzopay/shared';
import { api, ApiError } from '@/lib/api';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Alert, Field, Input } from '@/components/ui/primitives';
import { VirtualCard } from '@/components/virtual-card';
import { cn } from '@/lib/utils';

/**
 * Create-card flow: name -> limits -> review -> create.
 *
 * The review step exists because a card's limits are a financial commitment;
 * seeing them once more before issuing prevents the common "I meant $500 a
 * month, not a day" mistake.
 */
const steps = ['Name', 'Limits', 'Review'] as const;

export function CreateCardDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [step, setStep] = useState(0);
  const [created, setCreated] = useState<CardSummary | null>(null);

  const {
    register,
    handleSubmit,
    watch,
    trigger,
    reset,
    formState: { errors },
  } = useForm<CreateCardInput>({
    resolver: zodResolver(createCardSchema),
    defaultValues: { name: '', dailyLimitUsd: 500, monthlyLimitUsd: 5000 },
  });

  const values = watch();

  const mutation = useMutation({
    mutationFn: (input: CreateCardInput) => api.post<CardSummary>('/cards', input),
    onSuccess: (card) => {
      setCreated(card);
      void queryClient.invalidateQueries({ queryKey: ['cards'] });
      void queryClient.invalidateQueries({ queryKey: ['overview'] });
      router.refresh();
    },
  });

  function close() {
    onOpenChange(false);
    // Reset after the close animation so the form does not visibly clear.
    setTimeout(() => {
      setStep(0);
      setCreated(null);
      reset();
      mutation.reset();
    }, 200);
  }

  async function next() {
    const valid = await trigger(
      step === 0
        ? ['name']
        : ['dailyLimitUsd', 'monthlyLimitUsd', 'perTransactionLimitUsd'],
    );
    if (valid) setStep((s) => s + 1);
  }

  const numeric = { setValueAs: (v: string) => (v === '' ? undefined : Number(v)) };

  return (
    <Dialog open={open} onOpenChange={(v) => (v ? onOpenChange(v) : close())}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {created ? 'Card created' : 'Create a new card'}
          </DialogTitle>
          <DialogDescription>
            {created
              ? 'Your new card is active and ready to use.'
              : 'It spends from your existing balance — no top-up needed.'}
          </DialogDescription>
        </DialogHeader>

        {created ? (
          <>
            <div className="mx-auto w-full max-w-xs">
              <VirtualCard card={created} />
            </div>
            <p className="text-center text-ui text-muted-foreground">
              <span className="font-semibold text-foreground">{created.name}</span>{' '}
              is active and ready to use.
            </p>
            <DialogFooter>
              <Button variant="secondary" className="flex-1" onClick={close}>
                Done
              </Button>
              <Button
                className="flex-1"
                onClick={() => {
                  close();
                  router.push(`/cards/${created.id}`);
                }}
              >
                View card
              </Button>
            </DialogFooter>
          </>
        ) : (
          <form
            onSubmit={handleSubmit((input) => mutation.mutate(input))}
            noValidate
          >
            <Stepper current={step} />

            {mutation.isError ? (
              <Alert tone="critical" className="mb-4">
                {mutation.error instanceof ApiError
                  ? mutation.error.message
                  : 'We could not create the card. Please try again.'}
              </Alert>
            ) : null}

            {step === 0 ? (
              <Field
                label="Card name"
                htmlFor="name"
                error={errors.name?.message}
                hint="Something you will recognise later, like “Facebook Ads”."
              >
                <Input
                  id="name"
                  autoFocus
                  maxLength={40}
                  placeholder="Marketing"
                  invalid={!!errors.name}
                  {...register('name')}
                />
              </Field>
            ) : null}

            {step === 1 ? (
              <div className="space-y-4">
                <Field
                  label="Per-transaction limit (USD)"
                  htmlFor="perTransactionLimitUsd"
                  error={errors.perTransactionLimitUsd?.message}
                  hint="Optional. The most any single payment can be."
                >
                  <Input
                    id="perTransactionLimitUsd"
                    type="number"
                    min={1}
                    placeholder="250"
                    invalid={!!errors.perTransactionLimitUsd}
                    {...register('perTransactionLimitUsd', numeric)}
                  />
                </Field>

                <Field
                  label="Daily limit (USD)"
                  htmlFor="dailyLimitUsd"
                  error={errors.dailyLimitUsd?.message}
                >
                  <Input
                    id="dailyLimitUsd"
                    type="number"
                    min={1}
                    placeholder="500"
                    invalid={!!errors.dailyLimitUsd}
                    {...register('dailyLimitUsd', numeric)}
                  />
                </Field>

                <Field
                  label="Monthly limit (USD)"
                  htmlFor="monthlyLimitUsd"
                  error={errors.monthlyLimitUsd?.message}
                >
                  <Input
                    id="monthlyLimitUsd"
                    type="number"
                    min={1}
                    placeholder="5000"
                    invalid={!!errors.monthlyLimitUsd}
                    {...register('monthlyLimitUsd', numeric)}
                  />
                </Field>
              </div>
            ) : null}

            {step === 2 ? (
              <dl className="divide-y divide-hairline rounded-card bg-surface-raised px-4">
                <ReviewRow label="Card name" value={values.name} />
                <ReviewRow
                  label="Per transaction"
                  value={
                    values.perTransactionLimitUsd
                      ? `$${values.perTransactionLimitUsd}`
                      : 'No limit'
                  }
                />
                <ReviewRow
                  label="Daily limit"
                  value={values.dailyLimitUsd ? `$${values.dailyLimitUsd}` : 'No limit'}
                />
                <ReviewRow
                  label="Monthly limit"
                  value={values.monthlyLimitUsd ? `$${values.monthlyLimitUsd}` : 'No limit'}
                />
              </dl>
            ) : null}

            <DialogFooter className="mt-6">
              {step > 0 ? (
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => setStep((s) => s - 1)}
                  disabled={mutation.isPending}
                >
                  Back
                </Button>
              ) : null}

              {step < steps.length - 1 ? (
                <Button type="button" className="sm:ml-auto" onClick={next}>
                  Continue
                </Button>
              ) : (
                <Button
                  type="submit"
                  className="sm:ml-auto"
                  loading={mutation.isPending}
                >
                  Create card
                </Button>
              )}
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Stepper({ current }: { current: number }) {
  return (
    <ol className="mb-6 flex items-center gap-2" aria-label="Progress">
      {steps.map((label, index) => {
        const done = index < current;
        const active = index === current;

        return (
          <li key={label} className="flex flex-1 items-center gap-2">
            <span
              aria-current={active ? 'step' : undefined}
              className={cn(
                'flex size-6 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold transition-colors',
                done
                  ? 'bg-positive text-white'
                  : active
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted text-muted-foreground',
              )}
            >
              {done ? <Check className="size-3" strokeWidth={3} /> : index + 1}
            </span>
            <span
              className={cn(
                'text-caption font-semibold',
                active ? 'text-foreground' : 'text-muted-foreground',
              )}
            >
              {label}
            </span>
            {index < steps.length - 1 ? (
              <span className="h-px flex-1 bg-border" aria-hidden />
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}

function ReviewRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between px-4 py-3">
      <dt className="text-ui text-muted-foreground">{label}</dt>
      <dd className="text-ui font-semibold text-foreground">{value || '—'}</dd>
    </div>
  );
}
