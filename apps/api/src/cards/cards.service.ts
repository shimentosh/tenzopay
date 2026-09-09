import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  CardRuleState,
  CardRuleType,
  CardStatus,
  CardTransactionStatus,
  FeeType,
  NotificationType,
  Prisma,
  SpendLimitDuration,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { LedgerService } from '../ledger/ledger.service';
import { FeesService } from '../ledger/fees.service';
import { SettingsService } from '../settings/settings.service';
import { CARD_PROVIDER, type CardProvider } from '../providers/card-provider.interface';
import {
  CardOperationError,
  ForbiddenError,
  InsufficientBalanceError,
  NotFoundError,
} from '../common/errors';
import type { CreateCardInput, UpdateCardLimitsInput } from '@tenzopay/shared';

/**
 * Card issuing and control.
 *
 * Two things worth knowing before changing this file:
 *
 * 1. **Limits are enforced in three places** and they are not redundant:
 *      - the Lithic card `spend_limit` (a hard per-card ceiling),
 *      - a Lithic Auth Rules V2 VELOCITY_LIMIT (per-card, per period),
 *      - TenzoPay's ASA decision (the SHARED balance across all cards).
 *    Only the third can express "all cards draw on one pool".
 *
 * 2. **A new auth rule does not enforce until it is promoted.** Lithic creates
 *    rules in SHADOWING. `createVelocityRule` is always followed by
 *    `promoteRule`, and the resulting state is persisted so the admin panel can
 *    show rules that failed to activate.
 */
@Injectable()
export class CardsService {
  private readonly logger = new Logger(CardsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly ledger: LedgerService,
    private readonly fees: FeesService,
    private readonly settings: SettingsService,
    @Inject(CARD_PROVIDER) private readonly provider: CardProvider,
  ) {}

  // -------------------------------------------------------------- Create ----

  async create(userId: string, input: CreateCardInput) {
    const holder = await this.prisma.accountHolder.findUnique({
      where: { userId },
      select: { providerAccountToken: true, status: true },
    });

    if (holder?.status !== 'ACCEPTED') {
      throw new ForbiddenError(
        'Complete identity verification before creating a card.',
      );
    }

    // Guard against unbounded card creation per user. The ceiling is a setting
    // so it can be raised for a customer without a deploy.
    const maxCards = await this.settings.get('limits.max_cards_per_user');
    const activeCount = await this.prisma.card.count({
      where: { userId, status: { not: CardStatus.CLOSED } },
    });
    if (BigInt(activeCount) >= maxCards) {
      throw new CardOperationError(
        `You have reached the maximum of ${maxCards} open cards. Close one to create another.`,
      );
    }

    // Dollars in, cents everywhere after this line.
    const perTransaction = input.perTransactionLimitUsd
      ? BigInt(input.perTransactionLimitUsd) * 100n
      : null;
    const daily = input.dailyLimitUsd ? BigInt(input.dailyLimitUsd) * 100n : null;
    const monthly = input.monthlyLimitUsd ? BigInt(input.monthlyLimitUsd) * 100n : null;

    // The provider-side hard ceiling: prefer monthly, else daily.
    const providerLimit = monthly ?? daily ?? undefined;
    const providerDuration: SpendLimitDuration = monthly
      ? SpendLimitDuration.MONTHLY
      : SpendLimitDuration.DAILY;

    // Stable per (user, name, limits) so a double-submit cannot issue two cards.
    const idempotencyKey = `card:${userId}:${this.hashInput(input)}`;

    /**
     * Charge before issuing, not after.
     *
     * Creating the card at the provider costs money and cannot be undone
     * cheaply, so an account that cannot cover the fee is turned away first.
     * The key is derived from the same input hash as the card itself, so a
     * double-submit charges once.
     */
    const issuanceFee = await this.fees.cardIssuanceFee();
    if (issuanceFee > 0n) {
      try {
        await this.ledger.chargeFee({
          userId,
          idempotencyKey: `fee:issuance:${idempotencyKey}`,
          amount: issuanceFee,
          feeType: FeeType.CARD_ISSUANCE,
          description: `Card issuance fee — ${input.name}`,
        });
      } catch (err) {
        if (err instanceof InsufficientBalanceError) {
          throw new CardOperationError(
            'Your balance does not cover the card issuance fee. Add money and try again.',
          );
        }
        throw err;
      }
    }

    const providerCard = await this.provider.createVirtualCard({
      accountToken: holder.providerAccountToken ?? undefined,
      name: input.name,
      spendLimit: providerLimit,
      spendLimitDuration: providerDuration,
      idempotencyKey,
    });

    const card = await this.prisma.card.upsert({
      where: { providerCardToken: providerCard.cardToken },
      create: {
        userId,
        name: input.name,
        providerName: this.provider.name,
        providerCardToken: providerCard.cardToken,
        providerAccountToken: providerCard.accountToken,
        lastFour: providerCard.lastFour,
        expMonth: providerCard.expMonth,
        expYear: providerCard.expYear,
        network: providerCard.network,
        cardType: providerCard.cardType,
        status: CardStatus.ACTIVE,
        spendLimit: providerCard.spendLimit,
        spendLimitDuration: providerDuration,
        dailyLimit: daily,
        monthlyLimit: monthly,
        perTransactionLimit: perTransaction,
        lastSyncedAt: new Date(),
      },
      update: {},
    });

    // Velocity rules — created then PROMOTED, else they silently do nothing.
    if (daily) {
      await this.attachVelocityRule(card.id, providerCard.cardToken, daily, 'DAY');
    }
    if (monthly) {
      await this.attachVelocityRule(card.id, providerCard.cardToken, monthly, 'MONTH');
    }

    await this.notify(userId, NotificationType.CARD_CREATED, {
      title: 'Card created',
      body: `${input.name} is ready to use.`,
      metadata: { cardId: card.id },
    });

    this.logger.log(`Card ${card.id} created for user ${userId}`);
    return this.toSummary(card);
  }

  private async attachVelocityRule(
    cardId: string,
    cardToken: string,
    limitAmount: bigint,
    period: 'DAY' | 'MONTH',
  ): Promise<void> {
    try {
      const created = await this.provider.createVelocityRule({
        cardToken,
        name: `TenzoPay ${period === 'DAY' ? 'daily' : 'monthly'} limit`,
        limitAmount,
        period,
        idempotencyKey: `rule:${cardToken}:${period}:${limitAmount}`,
      });

      // Without this the rule sits in SHADOWING and enforces nothing.
      const promoted = await this.provider.promoteRule(created.ruleToken);

      await this.prisma.cardRule.create({
        data: {
          cardId,
          providerRuleToken: promoted.ruleToken,
          type: CardRuleType.VELOCITY_LIMIT,
          state: this.mapRuleState(promoted.state),
          period,
          limitAmount,
          parameters: { scope: 'CARD', period, limitAmount: limitAmount.toString() },
        },
      });
    } catch (err) {
      // A failed rule must not orphan a successfully-issued card. The card is
      // still protected by its provider spend limit and by ASA; the admin
      // panel surfaces rules that are missing or un-promoted.
      this.logger.error(
        `Failed to attach ${period} velocity rule to card ${cardId}: ` +
          `${err instanceof Error ? err.message : 'unknown'}`,
      );
    }
  }

  private mapRuleState(state: string): CardRuleState {
    switch (state) {
      case 'ACTIVE':
        return CardRuleState.ACTIVE;
      case 'SHADOWING':
        return CardRuleState.SHADOWING;
      case 'DRAFT':
        return CardRuleState.DRAFT;
      default:
        return CardRuleState.INACTIVE;
    }
  }

  // ---------------------------------------------------------------- Read ----

  async listForUser(userId: string) {
    const cards = await this.prisma.card.findMany({
      where: { userId },
      orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
    });

    return Promise.all(cards.map((card) => this.toSummaryWithUsage(card)));
  }

  async getForUser(userId: string, cardId: string) {
    const card = await this.prisma.card.findFirst({
      where: { id: cardId, userId },
      include: {
        rules: {
          select: {
            id: true, type: true, state: true, period: true, limitAmount: true,
          },
        },
      },
    });

    if (!card) throw new NotFoundError('Card');

    const summary = await this.toSummaryWithUsage(card);
    return {
      ...summary,
      rules: card.rules.map((r) => ({
        id: r.id,
        type: r.type,
        state: r.state,
        period: r.period,
        limitAmount: r.limitAmount?.toString() ?? null,
      })),
      /**
       * Only controls Lithic genuinely supports for a VIRTUAL card. There is
       * deliberately no ATM/contactless/chip toggle here: a virtual card cannot
       * do those things, and a switch that does nothing is a lie.
       */
      supportedControls: {
        freeze: true,
        close: true,
        spendLimit: true,
        velocityRules: true,
        merchantCategoryRules: true,
        atm: false,
        contactless: false,
        online: true,
      },
    };
  }

  // -------------------------------------------------------------- Mutate ----

  async setStatus(userId: string, cardId: string, action: 'freeze' | 'unfreeze' | 'close') {
    const card = await this.prisma.card.findFirst({ where: { id: cardId, userId } });
    if (!card) throw new NotFoundError('Card');

    if (card.status === CardStatus.CLOSED) {
      throw new CardOperationError('This card is closed and cannot be changed.');
    }
    if (action === 'unfreeze' && card.status !== CardStatus.FROZEN) {
      throw new CardOperationError('This card is not frozen.');
    }
    if (action === 'freeze' && card.status !== CardStatus.ACTIVE) {
      throw new CardOperationError('Only an active card can be frozen.');
    }

    const target =
      action === 'freeze'
        ? CardStatus.FROZEN
        : action === 'unfreeze'
          ? CardStatus.ACTIVE
          : CardStatus.CLOSED;

    // Provider first: if the issuer rejects it, our state must not drift.
    await this.provider.setCardState(card.providerCardToken, target);

    const updated = await this.prisma.card.update({
      where: { id: card.id },
      data: {
        status: target,
        closedAt: target === CardStatus.CLOSED ? new Date() : null,
        lastSyncedAt: new Date(),
      },
    });

    if (target === CardStatus.FROZEN) {
      await this.notify(userId, NotificationType.CARD_FROZEN, {
        title: 'Card frozen',
        body: `${card.name} will decline new transactions until you unfreeze it.`,
        metadata: { cardId: card.id },
      });
    }

    this.logger.log(`Card ${card.id} -> ${target}`);
    return this.toSummary(updated);
  }

  async updateLimits(userId: string, cardId: string, input: UpdateCardLimitsInput) {
    const card = await this.prisma.card.findFirst({
      where: { id: cardId, userId },
      include: { rules: true },
    });
    if (!card) throw new NotFoundError('Card');
    if (card.status === CardStatus.CLOSED) {
      throw new CardOperationError('This card is closed and cannot be changed.');
    }

    const toCents = (v: number | null | undefined) =>
      v === undefined ? undefined : v === null ? null : BigInt(v) * 100n;

    const daily = toCents(input.dailyLimitUsd);
    const monthly = toCents(input.monthlyLimitUsd);
    const perTransaction = toCents(input.perTransactionLimitUsd);

    const nextDaily = daily === undefined ? card.dailyLimit : daily;
    const nextMonthly = monthly === undefined ? card.monthlyLimit : monthly;

    if (nextDaily && nextMonthly && nextDaily > nextMonthly) {
      throw new CardOperationError('The daily limit cannot exceed the monthly limit.');
    }

    const providerLimit = nextMonthly ?? nextDaily;
    await this.provider.updateCardLimit(
      card.providerCardToken,
      providerLimit,
      nextMonthly ? 'MONTHLY' : 'DAILY',
    );

    // Replace velocity rules rather than mutating them — Lithic versions rules,
    // and a clean replace avoids leaving a stale draft behind.
    for (const rule of card.rules) {
      if (rule.providerRuleToken) {
        await this.provider.deleteRule(rule.providerRuleToken).catch(() => undefined);
      }
    }
    await this.prisma.cardRule.deleteMany({ where: { cardId: card.id } });

    if (nextDaily) {
      await this.attachVelocityRule(card.id, card.providerCardToken, nextDaily, 'DAY');
    }
    if (nextMonthly) {
      await this.attachVelocityRule(card.id, card.providerCardToken, nextMonthly, 'MONTH');
    }

    const updated = await this.prisma.card.update({
      where: { id: card.id },
      data: {
        dailyLimit: nextDaily,
        monthlyLimit: nextMonthly,
        perTransactionLimit:
          perTransaction === undefined ? card.perTransactionLimit : perTransaction,
        spendLimit: providerLimit,
        spendLimitDuration: nextMonthly
          ? SpendLimitDuration.MONTHLY
          : SpendLimitDuration.DAILY,
        lastSyncedAt: new Date(),
      },
    });

    return this.toSummary(updated);
  }

  /**
   * Create a short-lived session for revealing the PAN/CVV.
   *
   * The response is a URL for an issuer-hosted iframe. TenzoPay never receives,
   * stores, or logs the card number — that is what keeps this application out
   * of PCI DSS scope.
   */
  async createRevealSession(userId: string, cardId: string) {
    const card = await this.prisma.card.findFirst({
      where: { id: cardId, userId },
      select: { providerCardToken: true, status: true },
    });
    if (!card) throw new NotFoundError('Card');
    if (card.status === CardStatus.CLOSED) {
      throw new CardOperationError('Card details are not available for a closed card.');
    }

    return this.provider.createCardRevealSession(card.providerCardToken);
  }

  // --------------------------------------------------------------- Views ----

  private async toSummaryWithUsage(card: Prisma.CardGetPayload<object>) {
    const [spentToday, spentThisMonth] = await Promise.all([
      this.spentSince(card.id, this.startOfDay()),
      this.spentSince(card.id, this.startOfMonth()),
    ]);

    return { ...this.toSummary(card), spentToday: spentToday.toString(), spentThisMonth: spentThisMonth.toString() };
  }

  /**
   * Spend in a window, measured from OUR records rather than the provider's,
   * so the figure is consistent with the balance the user is shown. Pending
   * authorizations count — money that is held is not money you can spend.
   */
  private async spentSince(cardId: string, since: Date): Promise<bigint> {
    const rows = await this.prisma.cardTransaction.findMany({
      where: {
        cardId,
        createdAt: { gte: since },
        status: {
          in: [CardTransactionStatus.PENDING, CardTransactionStatus.SETTLED],
        },
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

  private toSummary(card: Prisma.CardGetPayload<object>) {
    return {
      id: card.id,
      name: card.name,
      lastFour: card.lastFour,
      expMonth: card.expMonth,
      expYear: card.expYear,
      network: card.network,
      status: card.status,
      dailyLimit: card.dailyLimit?.toString() ?? null,
      monthlyLimit: card.monthlyLimit?.toString() ?? null,
      perTransactionLimit: card.perTransactionLimit?.toString() ?? null,
      spentToday: '0',
      spentThisMonth: '0',
      createdAt: card.createdAt.toISOString(),
    };
  }

  private startOfDay(): Date {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }

  private startOfMonth(): Date {
    const d = new Date();
    d.setDate(1);
    d.setHours(0, 0, 0, 0);
    return d;
  }

  private hashInput(input: CreateCardInput): string {
    return Buffer.from(
      `${input.name}|${input.dailyLimitUsd ?? ''}|${input.monthlyLimitUsd ?? ''}|${input.perTransactionLimitUsd ?? ''}`,
    )
      .toString('base64url')
      .slice(0, 40);
  }

  private async notify(
    userId: string,
    type: NotificationType,
    params: { title: string; body: string; metadata?: Prisma.InputJsonValue },
  ): Promise<void> {
    await this.prisma.notification
      .create({ data: { userId, type, ...params } })
      .catch(() => undefined);
  }
}
