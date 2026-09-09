/** Wire types shared between the Nest API and the Next.js client. */

export type AppEnv = 'development' | 'sandbox' | 'production';
export type DepositMode = 'demo' | 'sandbox' | 'production';

export type KycStatus =
  | 'NOT_STARTED'
  | 'PENDING_REVIEW'
  | 'PENDING_DOCUMENT'
  | 'ACCEPTED'
  | 'REJECTED';

export type CardStatus = 'ACTIVE' | 'FROZEN' | 'CLOSED';

export type DepositStatus =
  | 'PENDING'
  | 'DETECTED'
  | 'CONFIRMING'
  | 'CONFIRMED'
  | 'FAILED'
  | 'ORPHANED';

export type AdminRole = 'SUPER_ADMIN' | 'ADMIN' | 'FINANCE' | 'RISK' | 'SUPPORT';

/**
 * Present only when the signed-in customer also holds an ACTIVE console
 * account under the same email. It is a navigation hint — the console has its
 * own origin, password and cookie, so this grants no permission whatsoever.
 */
export interface StaffAccess {
  role: AdminRole;
  consoleUrl: string;
}

export interface SessionUser {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  status: string;
  kycStatus: KycStatus;
  staffAccess?: StaffAccess | null;
}

/**
 * All balances are strings of MINOR UNITS, not numbers — JSON numbers cannot
 * safely carry the full bigint range, and the client must not do float maths
 * on money. Format with `formatAmount` from '@tenzopay/shared'.
 */
export interface BalanceSnapshot {
  currency: string;
  /** Spendable right now. */
  available: string;
  /** Reserved by outstanding card authorizations. */
  held: string;
  /** available + held */
  total: string;
}

export interface CardSummary {
  id: string;
  name: string;
  lastFour: string;
  expMonth: string;
  expYear: string;
  network: string;
  status: CardStatus;
  dailyLimit: string | null;
  monthlyLimit: string | null;
  perTransactionLimit: string | null;
  /** Spent so far in the current window, USD cents. */
  spentToday: string;
  spentThisMonth: string;
  createdAt: string;
}

export interface DepositSummary {
  id: string;
  amount: string;
  currency: string;
  status: DepositStatus;
  network: string;
  txHash: string | null;
  confirmations: number;
  requiredConfirmations: number;
  isDemo: boolean;
  createdAt: string;
  confirmedAt: string | null;
}

export interface TransactionRow {
  id: string;
  kind: 'CARD' | 'DEPOSIT' | 'FEE' | 'ADJUSTMENT';
  description: string;
  /** Signed minor units relative to the user's available balance. */
  amount: string;
  currency: string;
  status: string;
  cardName?: string | null;
  cardLastFour?: string | null;
  reference?: string | null;
  createdAt: string;
  settledAt?: string | null;
}

export interface Paginated<T> {
  data: T[];
  nextCursor: string | null;
  hasMore: boolean;
}

export interface ApiErrorBody {
  statusCode: number;
  /** Stable machine-readable code, e.g. INSUFFICIENT_BALANCE. */
  code: string;
  /** Safe, user-facing message. Provider internals never appear here. */
  message: string;
  requestId?: string;
  details?: unknown;
}
