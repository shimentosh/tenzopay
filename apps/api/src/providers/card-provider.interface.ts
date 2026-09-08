/**
 * CardProvider — the seam that keeps Lithic replaceable.
 *
 * Everything in this interface is expressed in TenzoPay's own vocabulary. No
 * Lithic-specific field name, token shape or enum leaks through it, so a second
 * issuer can be added by writing one adapter and changing one DI token.
 *
 * Deliberately absent: any method that returns a full PAN or CVV. Card secrets
 * are never routed through TenzoPay's servers — the browser talks to the
 * issuer's iframe directly. See `createCardRevealSession`.
 */

export type ProviderCardState = 'ACTIVE' | 'FROZEN' | 'CLOSED';

export interface ProviderCard {
  cardToken: string;
  accountToken?: string | null;
  lastFour: string;
  expMonth: string;
  expYear: string;
  state: ProviderCardState;
  network: string;
  cardType: string;
  spendLimit: bigint | null;
  spendLimitDuration: string;
  memo?: string | null;
}

export interface CreateCardParams {
  accountToken?: string;
  /** Shown on the card in the UI; sent to the issuer as the memo. */
  name: string;
  /** USD cents. */
  spendLimit?: bigint;
  spendLimitDuration?: 'TRANSACTION' | 'DAILY' | 'MONTHLY' | 'ANNUALLY' | 'FOREVER';
  /** Caller-supplied so a retried create cannot issue two cards. */
  idempotencyKey: string;
}

export interface CreateAccountHolderParams {
  firstName: string;
  lastName: string;
  dob: string;
  email: string;
  phoneNumber: string;
  governmentId: string;
  address: {
    address1: string;
    address2?: string;
    city: string;
    state: string;
    postalCode: string;
    country: string;
  };
  idempotencyKey: string;
}

export interface ProviderAccountHolder {
  accountHolderToken: string;
  accountToken: string;
  status: 'ACCEPTED' | 'PENDING_REVIEW' | 'PENDING_DOCUMENT' | 'REJECTED';
  statusReasons: string[];
}

export interface VelocityRuleParams {
  cardToken: string;
  name: string;
  /** USD cents. */
  limitAmount: bigint;
  period: 'DAY' | 'MONTH';
  idempotencyKey: string;
}

export interface ProviderRule {
  ruleToken: string;
  state: 'DRAFT' | 'SHADOWING' | 'ACTIVE' | 'INACTIVE';
}

export interface ProviderSpendUsage {
  /** USD cents spent in the window. */
  spentDaily: bigint;
  spentMonthly: bigint;
  availableDaily: bigint | null;
  availableMonthly: bigint | null;
}

export interface ProviderTransaction {
  transactionToken: string;
  cardToken: string;
  status: 'PENDING' | 'SETTLED' | 'DECLINED' | 'REVERSED' | 'EXPIRED';
  /** USD cents. */
  amount: bigint;
  settledAmount: bigint | null;
  currency: string;
  merchantName: string | null;
  mcc: string | null;
  merchantCountry: string | null;
  result: string | null;
  authorizedAt: string | null;
  raw: unknown;
}

export interface CardRevealSession {
  /**
   * URL of the issuer-hosted iframe that renders the PAN/CVV directly to the
   * user's browser. TenzoPay never sees the values — this is what keeps the
   * app out of PCI DSS scope.
   */
  embedUrl: string;
  expiresAt: string;
}

export interface CardProvider {
  readonly name: string;

  createAccountHolder(params: CreateAccountHolderParams): Promise<ProviderAccountHolder>;
  getAccountHolder(accountHolderToken: string): Promise<ProviderAccountHolder>;

  createVirtualCard(params: CreateCardParams): Promise<ProviderCard>;
  getCard(cardToken: string): Promise<ProviderCard>;
  listCards(accountToken?: string): Promise<ProviderCard[]>;
  setCardState(cardToken: string, state: ProviderCardState): Promise<ProviderCard>;
  updateCardLimit(
    cardToken: string,
    spendLimit: bigint | null,
    duration: CreateCardParams['spendLimitDuration'],
  ): Promise<ProviderCard>;

  createVelocityRule(params: VelocityRuleParams): Promise<ProviderRule>;
  /** Rules are created in SHADOWING and only enforce once promoted. */
  promoteRule(ruleToken: string): Promise<ProviderRule>;
  deleteRule(ruleToken: string): Promise<void>;

  getSpendUsage(cardToken: string): Promise<ProviderSpendUsage>;
  listTransactions(params: {
    cardToken?: string;
    pageSize?: number;
    begin?: string;
  }): Promise<ProviderTransaction[]>;
  getTransaction(transactionToken: string): Promise<ProviderTransaction | null>;

  createCardRevealSession(cardToken: string): Promise<CardRevealSession>;

  healthCheck(): Promise<{ ok: boolean; latencyMs: number; error?: string }>;
}

export const CARD_PROVIDER = Symbol('CARD_PROVIDER');
