'use client';

import { forwardRef } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { updateCardLimitsSchema, type UpdateCardLimitsInput, type CardSummary } from '@tenzopay/shared';
import { api, ApiError } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/** Limits arrive in USD cents and are edited in whole dollars. */
const toDollars = (cents: string | null) =>
  cents === null ? undefined : Number(BigInt(cents) / 100n);

export function CardLimitsForm({ card }: { card: CardSummary }) {
  const queryClient = useQueryClient();

  const {
    register,
    handleSubmit,
    formState: { errors, isDirty },
    reset,
  } = useForm<UpdateCardLimitsInput>({
    resolver: zodResolver(updateCardLimitsSchema),
    defaultValues: {
      perTransactionLimitUsd: toDollars(card.perTransactionLimit),
      dailyLimitUsd: toDollars(card.dailyLimit),
      monthlyLimitUsd: toDollars(card.monthlyLimit),
    },
  });

  const mutation = useMutation({
    mutationFn: (input: UpdateCardLimitsInput) =>
      api.patch<CardSummary>(`/cards/${card.id}/limits`, input),
    onSuccess: (updated) => {
      toast.success('Limits updated.');
      // Rules are recreated on the issuer, so refetch rather than patch locally.
      void queryClient.invalidateQueries({ queryKey: ['card', card.id] });
      void queryClient.invalidateQueries({ queryKey: ['cards'] });
      reset({
        perTransactionLimitUsd: toDollars(updated.perTransactionLimit),
        dailyLimitUsd: toDollars(updated.dailyLimit),
        monthlyLimitUsd: toDollars(updated.monthlyLimit),
      });
    },
    onError: (error) => {
      toast.error(
        error instanceof ApiError ? error.message : 'We could not update the limits.',
      );
    },
  });

  const numeric = { setValueAs: (v: string) => (v === '' ? null : Number(v)) };

  return (
    <form
      onSubmit={handleSubmit((values) => mutation.mutate(values))}
      className="space-y-6"
      noValidate
    >
      <div className="grid gap-5 sm:grid-cols-3">
        <LimitField
          id="perTx"
          label="Per transaction"
          hint="A single payment cannot exceed this."
          error={errors.perTransactionLimitUsd?.message}
          {...register('perTransactionLimitUsd', numeric)}
        />
        <LimitField
          id="daily"
          label="Daily"
          hint="Resets at midnight UTC."
          error={errors.dailyLimitUsd?.message}
          {...register('dailyLimitUsd', numeric)}
        />
        <LimitField
          id="monthly"
          label="Monthly"
          hint="Resets on the first."
          error={errors.monthlyLimitUsd?.message}
          {...register('monthlyLimitUsd', numeric)}
        />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-4 border-t border-hairline pt-5">
        <p className="text-ui text-content-tertiary">
          Leave a field empty for no limit of that kind.
        </p>
        <Button type="submit" disabled={!isDirty} loading={mutation.isPending}>
          Save limits
        </Button>
      </div>
    </form>
  );
}

/**
 * One limit.
 *
 * The currency sits inside the field rather than under it: these three are read
 * as a row, and a suffix on each one keeps the amounts aligned instead of
 * pushing every label out of line.
 */
const LimitField = forwardRef<
  HTMLInputElement,
  {
    id: string;
    label: string;
    hint: string;
    error?: string;
    name: string;
    onChange: React.ChangeEventHandler<HTMLInputElement>;
    onBlur: React.FocusEventHandler<HTMLInputElement>;
  }
>(function LimitField({ id, label, hint, error, ...field }, ref) {
  return (
    <div className="space-y-2">
      <label htmlFor={id} className="block text-ui font-semibold text-content-primary">
        {label}
      </label>

      <div
        className={cn(
          'flex h-14 items-center rounded-card bg-surface-inset pr-4 ring-1 transition-colors duration-150 ease',
          'focus-within:ring-2 focus-within:ring-ring',
          error ? 'ring-destructive' : 'ring-hairline',
        )}
      >
        <input
          id={id}
          ref={ref}
          type="number"
          min={1}
          inputMode="decimal"
          placeholder="No limit"
          aria-invalid={!!error || undefined}
          aria-describedby={`${id}-hint`}
          className="tnum h-full w-full min-w-0 rounded-card bg-transparent px-4 text-value font-semibold text-content-primary outline-none placeholder:font-normal placeholder:text-content-tertiary"
          {...field}
        />
        <span className="shrink-0 text-ui text-content-tertiary">USD</span>
      </div>

      <p
        id={`${id}-hint`}
        className={cn('text-caption', error ? 'text-negative' : 'text-content-tertiary')}
      >
        {error ?? hint}
      </p>
    </div>
  );
});
