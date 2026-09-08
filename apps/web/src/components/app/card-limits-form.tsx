'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { updateCardLimitsSchema, type UpdateCardLimitsInput, type CardSummary } from '@tenzopay/shared';
import { api, ApiError } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/primitives';

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
      className="space-y-4"
      noValidate
    >
      <div className="grid gap-4 sm:grid-cols-3">
        <Field
          label="Per transaction"
          htmlFor="perTx"
          error={errors.perTransactionLimitUsd?.message}
          hint="USD"
        >
          <Input
            id="perTx"
            type="number"
            min={1}
            invalid={!!errors.perTransactionLimitUsd}
            {...register('perTransactionLimitUsd', numeric)}
          />
        </Field>

        <Field label="Daily" htmlFor="daily" error={errors.dailyLimitUsd?.message} hint="USD">
          <Input
            id="daily"
            type="number"
            min={1}
            invalid={!!errors.dailyLimitUsd}
            {...register('dailyLimitUsd', numeric)}
          />
        </Field>

        <Field label="Monthly" htmlFor="monthly" error={errors.monthlyLimitUsd?.message} hint="USD">
          <Input
            id="monthly"
            type="number"
            min={1}
            invalid={!!errors.monthlyLimitUsd}
            {...register('monthlyLimitUsd', numeric)}
          />
        </Field>
      </div>

      <div className="flex justify-end">
        <Button
          type="submit"
          size="sm"
          disabled={!isDirty}
          loading={mutation.isPending}
        >
          Save limits
        </Button>
      </div>
    </form>
  );
}
