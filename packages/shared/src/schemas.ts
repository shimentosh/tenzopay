import { z } from 'zod';

/** Shared validation contracts. Used by the Nest API and the Next.js forms. */

const password = z
  .string()
  .min(12, 'Password must be at least 12 characters')
  .max(200)
  .regex(/[a-z]/, 'Must include a lowercase letter')
  .regex(/[A-Z]/, 'Must include an uppercase letter')
  .regex(/\d/, 'Must include a number');

export const registerSchema = z.object({
  email: z.string().email().max(255).toLowerCase().trim(),
  password,
  firstName: z.string().min(1).max(60).trim(),
  lastName: z.string().min(1).max(60).trim(),
});

export const loginSchema = z.object({
  email: z.string().email().max(255).toLowerCase().trim(),
  password: z.string().min(1).max(200),
});

export const forgotPasswordSchema = z.object({
  email: z.string().email().max(255).toLowerCase().trim(),
});

export const resetPasswordSchema = z.object({
  token: z.string().min(10).max(200),
  password,
});

/** Lithic KYC_BASIC payload. Address must be US for the sandbox workflow. */
export const kycSubmitSchema = z.object({
  firstName: z.string().min(1).max(60).trim(),
  lastName: z.string().min(1).max(60).trim(),
  dob: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD'),
  email: z.string().email().max(255).toLowerCase().trim(),
  phoneNumber: z.string().regex(/^\+[1-9]\d{7,14}$/, 'Use E.164 format, e.g. +15555555555'),
  governmentId: z
    .string()
    .regex(/^\d{3}-\d{2}-\d{4}$/, 'Use SSN format 123-45-6789'),
  address1: z.string().min(1).max(100).trim(),
  address2: z.string().max(100).trim().optional(),
  city: z.string().min(1).max(60).trim(),
  state: z.string().length(2, 'Use the 2-letter state code').toUpperCase(),
  postalCode: z.string().regex(/^\d{5}(-\d{4})?$/, 'Use a 5 or 9 digit ZIP'),
  country: z.string().length(3).toUpperCase().default('USA'),
});

export const spendLimitDurationSchema = z.enum([
  'TRANSACTION',
  'DAILY',
  'MONTHLY',
  'ANNUALLY',
  'FOREVER',
]);

/**
 * Limits are entered by the user in whole USD and converted to cents server-side.
 * Capped at 1,000,000 USD to keep the value well inside a 32-bit cent range for
 * the provider and to catch fat-finger input.
 */
const usdLimit = z
  .number()
  .int('Enter a whole dollar amount')
  .positive('Must be greater than zero')
  .max(1_000_000, 'Limit is too large');

export const createCardSchema = z
  .object({
    name: z.string().min(1, 'Give the card a name').max(40).trim(),
    perTransactionLimitUsd: usdLimit.optional(),
    dailyLimitUsd: usdLimit.optional(),
    monthlyLimitUsd: usdLimit.optional(),
  })
  .refine(
    (v) => v.dailyLimitUsd !== undefined || v.monthlyLimitUsd !== undefined,
    { message: 'Set at least a daily or monthly limit', path: ['dailyLimitUsd'] },
  )
  .refine(
    (v) =>
      v.dailyLimitUsd === undefined ||
      v.monthlyLimitUsd === undefined ||
      v.dailyLimitUsd <= v.monthlyLimitUsd,
    { message: 'Daily limit cannot exceed the monthly limit', path: ['dailyLimitUsd'] },
  )
  .refine(
    (v) =>
      v.perTransactionLimitUsd === undefined ||
      v.dailyLimitUsd === undefined ||
      v.perTransactionLimitUsd <= v.dailyLimitUsd,
    {
      message: 'Per-transaction limit cannot exceed the daily limit',
      path: ['perTransactionLimitUsd'],
    },
  );

export const updateCardLimitsSchema = z.object({
  perTransactionLimitUsd: usdLimit.nullable().optional(),
  dailyLimitUsd: usdLimit.nullable().optional(),
  monthlyLimitUsd: usdLimit.nullable().optional(),
});

export const cardStatusActionSchema = z.object({
  action: z.enum(['freeze', 'unfreeze', 'close']),
});

export const transactionQuerySchema = z.object({
  type: z.enum(['all', 'deposits', 'card', 'refunds', 'fees']).default('all'),
  status: z.string().optional(),
  cardId: z.string().uuid().optional(),
  from: z.string().optional(),
  to: z.string().optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
});

/** Demo-mode only. Guarded server-side by DEPOSIT_MODE !== 'production'. */
export const simulateDepositSchema = z.object({
  amount: z
    .string()
    .regex(/^\d+(\.\d{1,6})?$/, 'Enter an amount with up to 6 decimals'),
});

export const adminAdjustmentSchema = z.object({
  userId: z.string().uuid(),
  /** Signed decimal string: "100.50" credits, "-100.50" debits. */
  amount: z.string().regex(/^-?\d+(\.\d{1,6})?$/, 'Invalid amount'),
  reason: z.string().min(10, 'Give a reason of at least 10 characters').max(500),
});

export const adminLoginSchema = loginSchema;

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type KycSubmitInput = z.infer<typeof kycSubmitSchema>;
export type CreateCardInput = z.infer<typeof createCardSchema>;
export type UpdateCardLimitsInput = z.infer<typeof updateCardLimitsSchema>;
export type TransactionQuery = z.infer<typeof transactionQuerySchema>;
export type AdminAdjustmentInput = z.infer<typeof adminAdjustmentSchema>;
