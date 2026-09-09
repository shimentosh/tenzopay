import { Injectable, Logger } from '@nestjs/common';
import {
  AuthorizationDecision,
  CardStatus,
  CardTransactionStatus,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { LedgerService } from '../ledger/ledger.service';
import { FeesService } from '../ledger/fees.service';
import { InsufficientBalanceError } from '../common/errors';
import { usdCentsToUsdt } from '@tenzopay/shared';

/**
 * Auth Stream Access — real-time authorization decisioning.
 *
 * This is the heart of "one balance, many cards". Lithic calls this on every
 * authorization; we answer from our own ledger.
 *
 * Why this exists at all: a Lithic spend limit is a per-card ceiling. Five
 * cards each limited to $10,000 against a $10,000 balance could spend $50,000.
 * Only a check against the SHARED pool at authorization time can prevent that,
 * and only we know the pool.
 *
 * Hard constraints from Lithic:
 *   - Respond within ~3 s (declined at 6 s).
 *   - The endpoint is in the critical path of every transaction.
 *   - Duplicate deliveries happen; the same event token must not hold twice.
 *
 * Failure policy: **fail closed**. Any error, timeout, unknown card or
 * unparseable payload returns a decline. An issuer that approves on error is
 * an issuer that gets drained.
 */

export interface AsaRequest {
  token?: string;
  card_token?: string;
  amount?: number;
  /** Some payload versions nest the amounts. */
  amounts?: {
    cardholder?: { amount?: number; currency?: string };
    merchant?: { amount?: number; currency?: string };
    hold?: { amount?: number; currency?: string };
  };
  merchant?: { descriptor?: string; mcc?: string; country?: string; acceptor_id?: string };
  status?: string;
  pos?: unknown;
}

export interface AsaResponse {
  result:
    | 'APPROVED'
    | 'INSUFFICIENT_FUNDS'
    | 'VELOCITY_EXCEEDED'
    | 'CARD_PAUSED'
    | 'CARD_CLOSED'
    | 'UNAUTHORIZED_MERCHANT'
    | 'SUSPECTED_FRAUD';
}

@Injectable()
export class AsaService {
  private readonly logger = new Logger(AsaService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly ledger: LedgerService,
    private readonly fees: FeesService,
  ) {}

  async decide(payload: AsaRequest): Promise<AsaResponse> {
    const started = Date.now();

    const eventToken = payload.token;
    const cardToken = payload.card_token;
    const amountCents = this.extractAmount(payload);

    // Malformed payload — decline, do not guess.
    if (!eventToken || !cardToken || amountCents === null || amountCents < 0n) {
      this.logger.error(
        `ASA payload missing required fields (token=${!!eventToken}, ` +
          `card=${!!cardToken}, amount=${amountCents})`,
      );
      return { result: 'SUSPECTED_FRAUD' };
    }

    try {
      // --- Idempotency ----------------------------------------------------
      // Lithic retries on connection failure. Replaying the same event must
      // return the original decision, never place a second hold.
      const existing = await this.prisma.authorizationEvent.findUnique({
        where: { providerEventToken: eventToken },
        select: { decision: true },
      });

      if (existing) {
        this.logger.debug(`ASA replay for ${eventToken} -> ${existing.decision}`);
        return { result: this.toResponseResult(existing.decision) };
      }

      // --- Resolve the card ----------------------------------------------
      const card = await this.prisma.card.findUnique({
        where: { providerCardToken: cardToken },
        select: {
          id: true,
          userId: true,
          name: true,
          status: true,
          perTransactionLimit: true,
          dailyLimit: true,
          user: { select: { status: true } },
        },
      });

      if (!card) {
        // A card Lithic knows and we do not: refuse rather than approve blind.
        this.logger.error(`ASA for unknown card ${cardToken} — declining`);
        await this.record(eventToken, cardToken, null, amountCents,
          AuthorizationDecision.ERROR, 'unknown_card', null, started, payload);
        return { result: 'SUSPECTED_FRAUD' };
      }

      // --- Card and account state ----------------------------------------
      if (card.status === CardStatus.CLOSED) {
        return this.finish(eventToken, cardToken, card.userId, amountCents,
          AuthorizationDecision.CARD_CLOSED, 'card_closed', null, started, payload);
      }
      if (card.status === CardStatus.FROZEN) {
        return this.finish(eventToken, cardToken, card.userId, amountCents,
          AuthorizationDecision.CARD_PAUSED, 'card_frozen', null, started, payload);
      }
      if (card.user.status !== 'ACTIVE') {
        return this.finish(eventToken, cardToken, card.userId, amountCents,
          AuthorizationDecision.CARD_PAUSED, 'account_not_active', null, started, payload);
      }

      // --- Per-transaction limit -----------------------------------------
      if (card.perTransactionLimit && amountCents > card.perTransactionLimit) {
        return this.finish(eventToken, cardToken, card.userId, amountCents,
          AuthorizationDecision.VELOCITY_EXCEEDED, 'per_transaction_limit',
          null, started, payload);
      }

      // --- Daily limit, measured across our own records -------------------
      if (card.dailyLimit) {
        const spentToday = await this.spentToday(card.id);
        if (spentToday + amountCents > card.dailyLimit) {
          return this.finish(eventToken, cardToken, card.userId, amountCents,
            AuthorizationDecision.VELOCITY_EXCEEDED, 'daily_limit', null, started, payload);
        }
      }

      // --- The shared balance ---------------------------------------------
      // Card amounts are USD cents; the ledger is USDT minor units. See
      // ARCHITECTURE §0: this 1:1 conversion stands in for a real FX quote
      // from an off-ramp provider, which this build does not have.
      const spendAmount = usdCentsToUsdt(amountCents);

      /**
       * The fee is reserved inside the hold, not charged afterwards.
       *
       * If it were charged at settlement from whatever remains, a cardholder
       * who spends their balance to the last unit would leave a fee that
       * cannot be collected without pushing them negative — which the ledger
       * integrity check would then flag, correctly. Reserving it here means
       * the authorization is declined for the full cost or not at all, and
       * the rate in force at the tap is the rate charged even if settings
       * change before the merchant captures.
       */
      const merchantCurrency = payload.amounts?.merchant?.currency;
      const isForeign = !!merchantCurrency && merchantCurrency.toUpperCase() !== 'USD';
      const feeAmount = await this.fees.transactionFee(spendAmount, isForeign);
      const holdAmount = spendAmount + feeAmount;

      try {
        const { availableAfter } = await this.ledger.placeHold({
          userId: card.userId,
          idempotencyKey: `auth:${eventToken}`,
          amount: holdAmount,
          description: `Card authorization — ${card.name}`,
          metadata: {
            cardId: card.id,
            cardToken,
            eventToken,
            merchant: payload.merchant?.descriptor ?? null,
            mcc: payload.merchant?.mcc ?? null,
            feeAmount: feeAmount.toString(),
          },
        });

        await this.upsertPendingTransaction(card, eventToken, amountCents, payload, feeAmount);

        return this.finish(eventToken, cardToken, card.userId, amountCents,
          AuthorizationDecision.APPROVED, null, availableAfter, started, payload);
      } catch (err) {
        if (err instanceof InsufficientBalanceError) {
          return this.finish(eventToken, cardToken, card.userId, amountCents,
            AuthorizationDecision.INSUFFICIENT_FUNDS, 'insufficient_balance',
            err.available, started, payload);
        }
        throw err;
      }
    } catch (err) {
      // Fail closed. Never approve because something broke.
      const detail = this.classifyFailure(err);

      this.logger.error(
        `ASA decision failed for ${eventToken} [${detail}]: ` +
          `${err instanceof Error ? err.message : 'unknown'}`,
        err instanceof Error ? err.stack : undefined,
      );

      // Record WHY, not just "internal_error". An operator looking at a spike
      // of declines needs to distinguish a serialization storm from a pool
      // exhaustion from a genuine bug — they have completely different fixes.
      await this.record(eventToken, cardToken, null, amountCents ?? 0n,
        AuthorizationDecision.ERROR, detail, null, started, payload)
        .catch(() => undefined);

      return { result: 'INSUFFICIENT_FUNDS' };
    }
  }

  // -------------------------------------------------------------- helpers ---

  /**
   * Reduce a thrown error to a short, actionable cause.
   *
   * These map to genuinely different remedies: a connection-pool timeout means
   * raise `connection_limit`; a serialization storm means the retry budget is
   * too small; anything else is a real defect.
   */
  private classifyFailure(err: unknown): string {
    const message = (err instanceof Error ? err.message : String(err)).toLowerCase();

    if (message.includes('connection pool')) return 'db_pool_exhausted';
    if (message.includes('could not serialize') || message.includes('40001')) {
      return 'serialization_conflict';
    }
    if (message.includes('deadlock')) return 'deadlock';
    if (message.includes('timed out') || message.includes('timeout')) return 'db_timeout';
    return 'internal_error';
  }

  private extractAmount(payload: AsaRequest): bigint | null {
    const candidate =
      payload.amount ??
      payload.amounts?.hold?.amount ??
      payload.amounts?.cardholder?.amount ??
      payload.amounts?.merchant?.amount;

    if (candidate === undefined || candidate === null) return null;
    if (!Number.isFinite(candidate)) return null;

    return BigInt(Math.round(Math.abs(candidate)));
  }

  private async spentToday(cardId: string): Promise<bigint> {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    const rows = await this.prisma.cardTransaction.findMany({
      where: {
        cardId,
        createdAt: { gte: startOfDay },
        status: { in: [CardTransactionStatus.PENDING, CardTransactionStatus.SETTLED] },
      },
      select: { amount: true, settledAmount: true, status: true },
    });

    return rows.reduce((total, row) => {
      const value =
        row.status === CardTransactionStatus.SETTLED && row.settledAmount !== null
          ? row.settledAmount
          : row.amount;
      return total + value;
    }, 0n);
  }

  private async upsertPendingTransaction(
    card: { id: string; userId: string },
    eventToken: string,
    amountCents: bigint,
    payload: AsaRequest,
    feeAmount: bigint,
  ): Promise<void> {
    await this.prisma.cardTransaction
      .upsert({
        where: { providerTransactionToken: eventToken },
        create: {
          cardId: card.id,
          userId: card.userId,
          providerTransactionToken: eventToken,
          status: CardTransactionStatus.PENDING,
          amount: amountCents,
          feeAmount,
          currency: payload.amounts?.cardholder?.currency ?? 'USD',
          merchantName: payload.merchant?.descriptor ?? null,
          mcc: payload.merchant?.mcc ?? null,
          merchantCountry: payload.merchant?.country ?? null,
          authorizedAt: new Date(),
        },
        update: {},
      })
      .catch((err) => {
        // A transaction row failing must not reverse an approved hold — the
        // webhook sync will reconcile it.
        this.logger.warn(
          `Could not persist pending transaction for ${eventToken}: ` +
            `${err instanceof Error ? err.message : 'unknown'}`,
        );
      });
  }

  private async finish(
    eventToken: string,
    cardToken: string,
    userId: string | null,
    amount: bigint,
    decision: AuthorizationDecision,
    reason: string | null,
    balance: bigint | null,
    started: number,
    payload: AsaRequest,
  ): Promise<AsaResponse> {
    await this.record(eventToken, cardToken, userId, amount, decision, reason, balance, started, payload);

    const latency = Date.now() - started;
    if (latency > 2000) {
      this.logger.warn(`ASA decision took ${latency}ms — approaching Lithic's 3s budget`);
    }

    return { result: this.toResponseResult(decision) };
  }

  private async record(
    eventToken: string,
    cardToken: string,
    userId: string | null,
    amount: bigint,
    decision: AuthorizationDecision,
    reason: string | null,
    balance: bigint | null,
    started: number,
    payload: AsaRequest,
  ): Promise<void> {
    await this.prisma.authorizationEvent
      .create({
        data: {
          providerEventToken: eventToken,
          cardToken,
          userId,
          amount,
          decision,
          reason,
          availableBalanceAtDecision: balance,
          latencyMs: Date.now() - started,
          // Merchant context only — never the full payload, which carries PAN
          // entry data and other sensitive fields.
          raw: {
            merchant: payload.merchant?.descriptor ?? null,
            mcc: payload.merchant?.mcc ?? null,
            country: payload.merchant?.country ?? null,
          } as Prisma.InputJsonValue,
        },
      })
      .catch((err) => {
        if (
          err instanceof Prisma.PrismaClientKnownRequestError &&
          err.code === 'P2002'
        ) {
          return; // concurrent duplicate delivery
        }
        this.logger.error('Failed to record authorization event');
      });
  }

  private toResponseResult(decision: AuthorizationDecision): AsaResponse['result'] {
    switch (decision) {
      case AuthorizationDecision.APPROVED:
        return 'APPROVED';
      case AuthorizationDecision.INSUFFICIENT_FUNDS:
        return 'INSUFFICIENT_FUNDS';
      case AuthorizationDecision.VELOCITY_EXCEEDED:
        return 'VELOCITY_EXCEEDED';
      case AuthorizationDecision.CARD_PAUSED:
        return 'CARD_PAUSED';
      case AuthorizationDecision.CARD_CLOSED:
        return 'CARD_CLOSED';
      case AuthorizationDecision.UNAUTHORIZED_MERCHANT:
        return 'UNAUTHORIZED_MERCHANT';
      default:
        return 'INSUFFICIENT_FUNDS';
    }
  }
}
