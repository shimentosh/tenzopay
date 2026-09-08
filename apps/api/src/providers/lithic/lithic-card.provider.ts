import { Injectable, Logger } from '@nestjs/common';
import { LithicClient } from './lithic.client';
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
import { CardOperationError } from '../../common/errors';

/**
 * Lithic adapter.
 *
 * Endpoint choices reflect what was verified against the sandbox (see
 * docs/ARCHITECTURE.md §8), not what older tutorials suggest:
 *
 *   - Auth Rules **V2** (`/v2/auth_rules`). V1 endpoints have been REMOVED by
 *     Lithic. Rules are created in SHADOWING and must be promoted to enforce.
 *   - Card state uses Lithic's real enum: OPEN / PAUSED / CLOSED. TenzoPay
 *     invents no states.
 *   - PAN/CVV are never fetched. `createCardRevealSession` hands the browser an
 *     iframe URL instead.
 */

/** Lithic card states we act on. */
type LithicCardState = 'OPEN' | 'PAUSED' | 'CLOSED' | 'PENDING_ACTIVATION' | 'PENDING_FULFILLMENT';

interface LithicCardResponse {
  token: string;
  account_token?: string;
  last_four: string;
  exp_month: string;
  exp_year: string;
  state: LithicCardState;
  type: string;
  spend_limit?: number;
  spend_limit_duration?: string;
  memo?: string;
  network_program_token?: string;
}

interface LithicAccountHolderResponse {
  token: string;
  account_token: string;
  status: string;
  status_reasons?: string[];
}

interface LithicRuleResponse {
  token: string;
  state: string;
  current_version?: { version: number } | null;
  draft_version?: { version: number; state?: string } | null;
}

interface LithicTransactionResponse {
  token: string;
  card_token: string;
  status: string;
  result?: string;
  amounts?: {
    hold?: { amount: number; currency: string };
    settlement?: { amount: number; currency: string };
    cardholder?: { amount: number; currency: string };
    merchant?: { amount: number; currency: string };
  };
  merchant?: { descriptor?: string; mcc?: string; country?: string };
  created?: string;
}

@Injectable()
export class LithicCardProvider implements CardProvider {
  readonly name = 'lithic';
  private readonly logger = new Logger(LithicCardProvider.name);

  constructor(private readonly client: LithicClient) {}

  // ---------------------------------------------------------------- KYC ----

  async createAccountHolder(
    params: CreateAccountHolderParams,
  ): Promise<ProviderAccountHolder> {
    const response = await this.client.request<LithicAccountHolderResponse>(
      '/v1/account_holders',
      {
        method: 'POST',
        idempotencyKey: params.idempotencyKey,
        body: {
          workflow: 'KYC_BASIC',
          individual: {
            first_name: params.firstName,
            last_name: params.lastName,
            dob: params.dob,
            email: params.email,
            phone_number: params.phoneNumber,
            government_id: params.governmentId,
            address: {
              address1: params.address.address1,
              address2: params.address.address2,
              city: params.address.city,
              state: params.address.state,
              postal_code: params.address.postalCode,
              country: params.address.country,
            },
          },
          tos_timestamp: new Date().toISOString(),
        },
      },
    );

    return this.mapAccountHolder(response);
  }

  async getAccountHolder(accountHolderToken: string): Promise<ProviderAccountHolder> {
    const response = await this.client.request<LithicAccountHolderResponse>(
      `/v1/account_holders/${accountHolderToken}`,
    );
    return this.mapAccountHolder(response);
  }

  private mapAccountHolder(r: LithicAccountHolderResponse): ProviderAccountHolder {
    const status = (r.status ?? '').toUpperCase();
    const mapped: ProviderAccountHolder['status'] =
      status === 'ACCEPTED'
        ? 'ACCEPTED'
        : status === 'REJECTED'
          ? 'REJECTED'
          : status === 'PENDING_DOCUMENT'
            ? 'PENDING_DOCUMENT'
            : 'PENDING_REVIEW';

    return {
      accountHolderToken: r.token,
      accountToken: r.account_token,
      status: mapped,
      statusReasons: r.status_reasons ?? [],
    };
  }

  // -------------------------------------------------------------- Cards ----

  async createVirtualCard(params: CreateCardParams): Promise<ProviderCard> {
    const body: Record<string, unknown> = {
      type: 'VIRTUAL',
      state: 'OPEN',
      memo: params.name.slice(0, 40),
    };

    if (params.accountToken) body.account_token = params.accountToken;
    if (params.spendLimit !== undefined && params.spendLimit !== null) {
      body.spend_limit = Number(params.spendLimit);
      body.spend_limit_duration = params.spendLimitDuration ?? 'MONTHLY';
    }

    const response = await this.client.request<LithicCardResponse>('/v1/cards', {
      method: 'POST',
      idempotencyKey: params.idempotencyKey,
      body,
    });

    return this.mapCard(response);
  }

  async getCard(cardToken: string): Promise<ProviderCard> {
    const response = await this.client.request<LithicCardResponse>(
      `/v1/cards/${cardToken}`,
    );
    return this.mapCard(response);
  }

  async listCards(accountToken?: string): Promise<ProviderCard[]> {
    const response = await this.client.request<{ data: LithicCardResponse[] }>(
      '/v1/cards',
      { query: { account_token: accountToken, page_size: 100 } },
    );
    return (response.data ?? []).map((c) => this.mapCard(c));
  }

  async setCardState(
    cardToken: string,
    state: ProviderCardState,
  ): Promise<ProviderCard> {
    const response = await this.client.request<LithicCardResponse>(
      `/v1/cards/${cardToken}`,
      { method: 'PATCH', body: { state: this.toLithicState(state) } },
    );
    return this.mapCard(response);
  }

  async updateCardLimit(
    cardToken: string,
    spendLimit: bigint | null,
    duration: CreateCardParams['spendLimitDuration'],
  ): Promise<ProviderCard> {
    const response = await this.client.request<LithicCardResponse>(
      `/v1/cards/${cardToken}`,
      {
        method: 'PATCH',
        body: {
          spend_limit: spendLimit === null ? 0 : Number(spendLimit),
          spend_limit_duration: duration ?? 'MONTHLY',
        },
      },
    );
    return this.mapCard(response);
  }

  // -------------------------------------------------------- Auth rules ----

  /**
   * Create a card-scoped velocity limit.
   *
   * Verified behaviour: POST returns `state: "INACTIVE"` with a
   * `draft_version` in SHADOWING. It does NOT enforce until promoted.
   */
  async createVelocityRule(params: VelocityRuleParams): Promise<ProviderRule> {
    const response = await this.client.request<LithicRuleResponse>('/v2/auth_rules', {
      method: 'POST',
      idempotencyKey: params.idempotencyKey,
      body: {
        name: params.name.slice(0, 40),
        type: 'VELOCITY_LIMIT',
        card_tokens: [params.cardToken],
        parameters: {
          scope: 'CARD',
          period: { type: params.period },
          limit_amount: Number(params.limitAmount),
          limit_count: null,
        },
      },
    });

    return { ruleToken: response.token, state: this.mapRuleState(response.state) };
  }

  async promoteRule(ruleToken: string): Promise<ProviderRule> {
    const response = await this.client.request<LithicRuleResponse>(
      `/v2/auth_rules/${ruleToken}/promote`,
      { method: 'POST', body: {}, idempotencyKey: `promote:${ruleToken}` },
    );
    return { ruleToken: response.token, state: this.mapRuleState(response.state) };
  }

  async deleteRule(ruleToken: string): Promise<void> {
    await this.client.request(`/v2/auth_rules/${ruleToken}`, { method: 'DELETE' });
  }

  private mapRuleState(state: string): ProviderRule['state'] {
    const s = (state ?? '').toUpperCase();
    if (s === 'ACTIVE') return 'ACTIVE';
    if (s === 'SHADOWING') return 'SHADOWING';
    if (s === 'DRAFT') return 'DRAFT';
    return 'INACTIVE';
  }

  // ------------------------------------------------------------- Spend ----

  async getSpendUsage(cardToken: string): Promise<ProviderSpendUsage> {
    const response = await this.client.request<{
      available_spend_limit?: Record<string, number>;
      spend_limit?: Record<string, number>;
      spend_velocity?: Record<string, number>;
    }>(`/v1/cards/${cardToken}/spend_limits`);

    const velocity = response.spend_velocity ?? {};
    const available = response.available_spend_limit ?? {};

    return {
      spentDaily: BigInt(velocity.daily ?? 0),
      spentMonthly: BigInt(velocity.monthly ?? 0),
      availableDaily: available.daily !== undefined ? BigInt(available.daily) : null,
      availableMonthly:
        available.monthly !== undefined ? BigInt(available.monthly) : null,
    };
  }

  // ------------------------------------------------------ Transactions ----

  async listTransactions(params: {
    cardToken?: string;
    pageSize?: number;
    begin?: string;
  }): Promise<ProviderTransaction[]> {
    const response = await this.client.request<{ data: LithicTransactionResponse[] }>(
      '/v1/transactions',
      {
        query: {
          card_token: params.cardToken,
          page_size: params.pageSize ?? 50,
          begin: params.begin,
        },
      },
    );
    return (response.data ?? []).map((t) => this.mapTransaction(t));
  }

  async getTransaction(transactionToken: string): Promise<ProviderTransaction | null> {
    try {
      const response = await this.client.request<LithicTransactionResponse>(
        `/v1/transactions/${transactionToken}`,
      );
      return this.mapTransaction(response);
    } catch (err) {
      this.logger.warn(`Transaction ${transactionToken} not retrievable`);
      return null;
    }
  }

  private mapTransaction(t: LithicTransactionResponse): ProviderTransaction {
    const status = (t.status ?? '').toUpperCase();
    const mapped: ProviderTransaction['status'] =
      status === 'SETTLED'
        ? 'SETTLED'
        : status === 'DECLINED'
          ? 'DECLINED'
          : status === 'REVERSED' || status === 'VOIDED'
            ? 'REVERSED'
            : status === 'EXPIRED'
              ? 'EXPIRED'
              : 'PENDING';

    const hold = t.amounts?.hold?.amount ?? t.amounts?.cardholder?.amount ?? 0;
    const settlement = t.amounts?.settlement?.amount;

    return {
      transactionToken: t.token,
      cardToken: t.card_token,
      status: mapped,
      amount: BigInt(Math.abs(hold)),
      settledAmount:
        settlement !== undefined && settlement !== null
          ? BigInt(Math.abs(settlement))
          : null,
      currency: t.amounts?.cardholder?.currency ?? 'USD',
      merchantName: t.merchant?.descriptor ?? null,
      mcc: t.merchant?.mcc ?? null,
      merchantCountry: t.merchant?.country ?? null,
      result: t.result ?? null,
      authorizedAt: t.created ?? null,
      raw: t,
    };
  }

  // ------------------------------------------------------ Secure reveal ----

  /**
   * Create a short-lived embed session. The returned URL is loaded in an iframe
   * by the browser; the PAN and CVV are rendered by Lithic and never traverse
   * TenzoPay infrastructure.
   */
  async createCardRevealSession(cardToken: string): Promise<CardRevealSession> {
    const expiration = new Date(Date.now() + 5 * 60_000).toISOString();

    const response = await this.client.request<{ url?: string; embed_url?: string }>(
      `/v1/cards/${cardToken}/embed`,
      {
        method: 'POST',
        idempotencyKey: `embed:${cardToken}:${Date.now()}`,
        body: { card_token: cardToken, expiration },
      },
    );

    const embedUrl = response.embed_url ?? response.url;
    if (!embedUrl) {
      throw new CardOperationError('Card details are temporarily unavailable.');
    }

    return { embedUrl, expiresAt: expiration };
  }

  // ------------------------------------------------------------ Health ----

  async healthCheck(): Promise<{ ok: boolean; latencyMs: number; error?: string }> {
    const started = Date.now();
    try {
      await this.client.request('/v1/status', { maxRetries: 0, timeoutMs: 5000 });
      return { ok: true, latencyMs: Date.now() - started };
    } catch (err) {
      return {
        ok: false,
        latencyMs: Date.now() - started,
        error: err instanceof Error ? err.message : 'unknown',
      };
    }
  }

  // ----------------------------------------------------------- Mapping ----

  private toLithicState(state: ProviderCardState): LithicCardState {
    switch (state) {
      case 'ACTIVE':
        return 'OPEN';
      case 'FROZEN':
        return 'PAUSED';
      case 'CLOSED':
        return 'CLOSED';
    }
  }

  private fromLithicState(state: LithicCardState): ProviderCardState {
    switch (state) {
      case 'OPEN':
      case 'PENDING_ACTIVATION':
      case 'PENDING_FULFILLMENT':
        return 'ACTIVE';
      case 'PAUSED':
        return 'FROZEN';
      case 'CLOSED':
        return 'CLOSED';
      default:
        return 'FROZEN';
    }
  }

  private mapCard(c: LithicCardResponse): ProviderCard {
    return {
      cardToken: c.token,
      accountToken: c.account_token ?? null,
      lastFour: c.last_four,
      expMonth: c.exp_month,
      expYear: c.exp_year,
      state: this.fromLithicState(c.state),
      network: 'VISA',
      cardType: c.type ?? 'VIRTUAL',
      spendLimit:
        c.spend_limit !== undefined && c.spend_limit !== null
          ? BigInt(c.spend_limit)
          : null,
      spendLimitDuration: c.spend_limit_duration ?? 'MONTHLY',
      memo: c.memo ?? null,
    };
  }
}
