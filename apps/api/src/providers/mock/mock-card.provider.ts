import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import {
  CardProvider,
  CardRevealSession,
  CreateAccountHolderParams,
  CreateCardParams,
  ProviderAccountHolder,
  ProviderCard,
  ProviderCardState,
  ProviderRule,
  ProviderSpendUsage,
  ProviderTransaction,
  VelocityRuleParams,
} from '../card-provider.interface';
import { NotFoundError } from '../../common/errors';

/**
 * In-memory CardProvider for local development and tests.
 *
 * This exists so the ledger, ASA logic and UI can be developed and tested
 * without touching a real issuer — NOT to make the app look functional when it
 * is not. Config forbids CARD_PROVIDER=mock when APP_ENV=production, and the
 * web UI shows a mode badge whenever a mock provider is in use.
 *
 * The PANs it generates are Luhn-valid test numbers in the 4111 test BIN. They
 * are not real cards and cannot authorize anywhere.
 */
@Injectable()
export class MockCardProvider implements CardProvider {
  readonly name = 'mock';
  private readonly logger = new Logger(MockCardProvider.name);

  private readonly cards = new Map<string, ProviderCard>();
  private readonly rules = new Map<string, ProviderRule & { cardToken: string }>();
  private readonly transactions = new Map<string, ProviderTransaction>();
  private readonly usage = new Map<string, { daily: bigint; monthly: bigint }>();

  async createAccountHolder(
    params: CreateAccountHolderParams,
  ): Promise<ProviderAccountHolder> {
    this.logger.warn('MockCardProvider: simulating KYC acceptance');
    return {
      accountHolderToken: randomUUID(),
      accountToken: randomUUID(),
      // Anything with a last name of "Review" lands in manual review, so the
      // pending-KYC UI path is reachable in development.
      status: params.lastName.toLowerCase() === 'review' ? 'PENDING_REVIEW' : 'ACCEPTED',
      statusReasons: [],
    };
  }

  async getAccountHolder(accountHolderToken: string): Promise<ProviderAccountHolder> {
    return {
      accountHolderToken,
      accountToken: randomUUID(),
      status: 'ACCEPTED',
      statusReasons: [],
    };
  }

  async createVirtualCard(params: CreateCardParams): Promise<ProviderCard> {
    const cardToken = randomUUID();
    const now = new Date();

    const card: ProviderCard = {
      cardToken,
      accountToken: params.accountToken ?? null,
      lastFour: this.generateLastFour(),
      expMonth: String(now.getMonth() + 1).padStart(2, '0'),
      expYear: String(now.getFullYear() + 4),
      state: 'ACTIVE',
      network: 'VISA',
      cardType: 'VIRTUAL',
      spendLimit: params.spendLimit ?? null,
      spendLimitDuration: params.spendLimitDuration ?? 'MONTHLY',
      memo: params.name,
    };

    this.cards.set(cardToken, card);
    this.usage.set(cardToken, { daily: 0n, monthly: 0n });
    return card;
  }

  async getCard(cardToken: string): Promise<ProviderCard> {
    const card = this.cards.get(cardToken);
    if (!card) throw new NotFoundError('Card');
    return card;
  }

  async listCards(): Promise<ProviderCard[]> {
    return [...this.cards.values()];
  }

  async setCardState(
    cardToken: string,
    state: ProviderCardState,
  ): Promise<ProviderCard> {
    const card = await this.getCard(cardToken);
    const updated = { ...card, state };
    this.cards.set(cardToken, updated);
    return updated;
  }

  async updateCardLimit(
    cardToken: string,
    spendLimit: bigint | null,
    duration: CreateCardParams['spendLimitDuration'],
  ): Promise<ProviderCard> {
    const card = await this.getCard(cardToken);
    const updated = {
      ...card,
      spendLimit,
      spendLimitDuration: duration ?? card.spendLimitDuration,
    };
    this.cards.set(cardToken, updated);
    return updated;
  }

  async createVelocityRule(params: VelocityRuleParams): Promise<ProviderRule> {
    const ruleToken = randomUUID();
    // Mirrors Lithic: rules start in SHADOWING and do not enforce until promoted.
    const rule = {
      ruleToken,
      state: 'SHADOWING' as const,
      cardToken: params.cardToken,
    };
    this.rules.set(ruleToken, rule);
    return { ruleToken, state: 'SHADOWING' };
  }

  async promoteRule(ruleToken: string): Promise<ProviderRule> {
    const rule = this.rules.get(ruleToken);
    if (!rule) throw new NotFoundError('Rule');
    const promoted = { ...rule, state: 'ACTIVE' as const };
    this.rules.set(ruleToken, promoted);
    return { ruleToken, state: 'ACTIVE' };
  }

  async deleteRule(ruleToken: string): Promise<void> {
    this.rules.delete(ruleToken);
  }

  async getSpendUsage(cardToken: string): Promise<ProviderSpendUsage> {
    const card = await this.getCard(cardToken);
    const used = this.usage.get(cardToken) ?? { daily: 0n, monthly: 0n };
    return {
      spentDaily: used.daily,
      spentMonthly: used.monthly,
      availableDaily: null,
      availableMonthly: card.spendLimit === null ? null : card.spendLimit - used.monthly,
    };
  }

  async listTransactions(params: { cardToken?: string }): Promise<ProviderTransaction[]> {
    const all = [...this.transactions.values()];
    return params.cardToken
      ? all.filter((t) => t.cardToken === params.cardToken)
      : all;
  }

  async getTransaction(transactionToken: string): Promise<ProviderTransaction | null> {
    return this.transactions.get(transactionToken) ?? null;
  }

  async createCardRevealSession(cardToken: string): Promise<CardRevealSession> {
    await this.getCard(cardToken);
    // Deliberately not a real PAN surface — the mock has no card secrets to show.
    return {
      embedUrl: `about:blank#mock-card-${cardToken}`,
      expiresAt: new Date(Date.now() + 5 * 60_000).toISOString(),
    };
  }

  async healthCheck(): Promise<{ ok: boolean; latencyMs: number }> {
    return { ok: true, latencyMs: 0 };
  }

  /** Test hook: record a simulated transaction against a mock card. */
  recordTransaction(tx: ProviderTransaction): void {
    this.transactions.set(tx.transactionToken, tx);
    const used = this.usage.get(tx.cardToken) ?? { daily: 0n, monthly: 0n };
    this.usage.set(tx.cardToken, {
      daily: used.daily + tx.amount,
      monthly: used.monthly + tx.amount,
    });
  }

  private generateLastFour(): string {
    return String(Math.floor(1000 + Math.random() * 9000));
  }
}
