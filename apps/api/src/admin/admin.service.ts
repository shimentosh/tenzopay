import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  AdminActionType,
  AdminRole,
  CardStatus,
  CardTransactionStatus,
  DepositStatus,
  Prisma,
  UserStatus,
  WebhookStatus,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { LedgerService } from '../ledger/ledger.service';
import { DepositsService } from '../deposits/deposits.service';
import { WebhooksService } from '../webhooks/webhooks.service';
import { CARD_PROVIDER, type CardProvider } from '../providers/card-provider.interface';
import {
  BLOCKCHAIN_PROVIDER,
  type BlockchainProvider,
} from '../providers/blockchain-provider.interface';
import { ForbiddenError, NotFoundError } from '../common/errors';
import { parseAmount } from '@tenzopay/shared';
import type { RequestAdmin } from '../auth/guards';

/**
 * Admin operations.
 *
 * The governing rule: **there is no way to set a balance.** The only way to
 * change customer funds is `adjustBalance`, which posts a balanced double-entry
 * pair, requires a written reason, records an AdminAction and an AuditLog, and
 * is restricted to SUPER_ADMIN and FINANCE.
 *
 * Every mutating method here writes an audit row. That is not defensive
 * paperwork — it is what makes a financial system answerable after the fact.
 */
@Injectable()
export class AdminService {
  private readonly logger = new Logger(AdminService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly ledger: LedgerService,
    private readonly deposits: DepositsService,
    private readonly webhooks: WebhooksService,
    @Inject(CARD_PROVIDER) private readonly cardProvider: CardProvider,
    @Inject(BLOCKCHAIN_PROVIDER) private readonly chain: BlockchainProvider,
  ) {}

  // ----------------------------------------------------------- Dashboard ----

  async dashboard() {
    const [
      totalUsers,
      verifiedUsers,
      frozenUsers,
      activeCards,
      frozenCards,
      closedCards,
      pendingDeposits,
      failedTransactions,
      deadLetters,
      depositAgg,
      cardVolumeAgg,
    ] = await Promise.all([
      this.prisma.user.count(),
      this.prisma.accountHolder.count({ where: { status: 'ACCEPTED' } }),
      this.prisma.user.count({ where: { status: UserStatus.FROZEN } }),
      this.prisma.card.count({ where: { status: CardStatus.ACTIVE } }),
      this.prisma.card.count({ where: { status: CardStatus.FROZEN } }),
      this.prisma.card.count({ where: { status: CardStatus.CLOSED } }),
      this.prisma.deposit.count({
        where: { status: { in: [DepositStatus.DETECTED, DepositStatus.CONFIRMING] } },
      }),
      this.prisma.cardTransaction.count({
        where: { status: CardTransactionStatus.DECLINED },
      }),
      this.prisma.webhookEvent.count({ where: { status: WebhookStatus.DEAD_LETTER } }),
      this.prisma.deposit.aggregate({
        where: { status: DepositStatus.CONFIRMED },
        _sum: { amount: true },
      }),
      this.prisma.cardTransaction.aggregate({
        where: { status: CardTransactionStatus.SETTLED },
        _sum: { settledAmount: true },
      }),
    ]);

    const integrity = await this.ledger.verifyIntegrity();

    const alerts: { level: 'error' | 'warn'; message: string }[] = [];
    if (!integrity.ok) {
      alerts.push({
        level: 'error',
        message: `Ledger integrity check failed: ${integrity.unbalanced.length} unbalanced transaction(s), ${integrity.negativeBalances.length} negative balance(s)`,
      });
    }
    if (deadLetters > 0) {
      alerts.push({
        level: 'warn',
        message: `${deadLetters} webhook event(s) in the dead-letter queue`,
      });
    }
    if (pendingDeposits > 0) {
      alerts.push({
        level: 'warn',
        message: `${pendingDeposits} deposit(s) awaiting confirmation`,
      });
    }

    return {
      users: { total: totalUsers, verified: verifiedUsers, frozen: frozenUsers },
      cards: { active: activeCards, frozen: frozenCards, closed: closedCards },
      deposits: {
        totalConfirmed: (depositAgg._sum.amount ?? 0n).toString(),
        pending: pendingDeposits,
      },
      // USD cents -> USDT minor units for a consistent unit across the console.
      cardVolume: ((cardVolumeAgg._sum.settledAmount ?? 0n) * 10_000n).toString(),
      failedTransactions,
      integrity,
      alerts,
    };
  }

  // --------------------------------------------------------------- Users ----

  async listUsers(params: { search?: string; status?: string; limit?: number; cursor?: string }) {
    const limit = Math.min(params.limit ?? 25, 100);
    const search = params.search?.trim();

    const users = await this.prisma.user.findMany({
      where: {
        ...(search
          ? {
              OR: [
                { email: { contains: search, mode: Prisma.QueryMode.insensitive } },
                { firstName: { contains: search, mode: Prisma.QueryMode.insensitive } },
                { lastName: { contains: search, mode: Prisma.QueryMode.insensitive } },
              ],
            }
          : {}),
        ...(params.status ? { status: params.status as UserStatus } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: limit + 1,
      ...(params.cursor ? { cursor: { id: params.cursor }, skip: 1 } : {}),
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        status: true,
        createdAt: true,
        accountHolder: { select: { status: true } },
        _count: { select: { cards: true, deposits: true } },
      },
    });

    const hasMore = users.length > limit;
    const page = hasMore ? users.slice(0, limit) : users;

    return {
      data: page.map((u) => ({
        id: u.id,
        email: u.email,
        name: [u.firstName, u.lastName].filter(Boolean).join(' ') || null,
        status: u.status,
        kycStatus: u.accountHolder?.status ?? 'NOT_STARTED',
        cardCount: u._count.cards,
        depositCount: u._count.deposits,
        createdAt: u.createdAt.toISOString(),
      })),
      nextCursor: hasMore ? page[page.length - 1].id : null,
      hasMore,
    };
  }

  /** Full user view for support: profile, balance, cards, deposits, activity. */
  async getUser(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        phoneNumber: true,
        status: true,
        emailVerifiedAt: true,
        lastLoginAt: true,
        createdAt: true,
        accountHolder: {
          select: { status: true, statusReasons: true, workflow: true, updatedAt: true },
        },
      },
    });

    if (!user) throw new NotFoundError('User');

    const [balance, cards, deposits, recentTransactions] = await Promise.all([
      this.ledger.getBalance(userId),
      this.prisma.card.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        select: {
          id: true, name: true, lastFour: true, status: true,
          dailyLimit: true, monthlyLimit: true, createdAt: true,
          providerCardToken: true, lastSyncedAt: true,
        },
      }),
      this.prisma.deposit.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        take: 20,
      }),
      this.prisma.cardTransaction.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        take: 20,
        include: { card: { select: { name: true, lastFour: true } } },
      }),
    ]);

    return {
      user: {
        ...user,
        kycStatus: user.accountHolder?.status ?? 'NOT_STARTED',
      },
      balance: {
        currency: balance.currency,
        available: balance.available.toString(),
        held: balance.held.toString(),
        total: balance.total.toString(),
      },
      cards,
      deposits,
      recentTransactions,
    };
  }

  async setUserStatus(
    admin: RequestAdmin,
    userId: string,
    status: 'FROZEN' | 'ACTIVE',
    reason: string,
  ) {
    this.requireRole(admin, [AdminRole.ADMIN, AdminRole.RISK]);

    const before = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { status: true },
    });
    if (!before) throw new NotFoundError('User');

    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: { status: status as UserStatus },
      select: { id: true, status: true },
    });

    // Freezing an account must also kill live sessions, or the user keeps
    // their access token until it expires.
    if (status === 'FROZEN') {
      await this.prisma.session.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    }

    await this.recordAction(admin, {
      type: status === 'FROZEN' ? AdminActionType.FREEZE_USER : AdminActionType.UNFREEZE_USER,
      targetType: 'User',
      targetId: userId,
      reason,
      before,
      after: updated,
    });

    return updated;
  }

  // ------------------------------------------------------------- Ledger ----

  /**
   * The ONLY way to change a customer balance.
   *
   * Posts a balanced pair against SYSTEM_ADJUSTMENT — it cannot create money
   * from nothing, because the counter-entry is always recorded. A debit that
   * would overdraw is rejected by the ledger.
   */
  async adjustBalance(
    admin: RequestAdmin,
    params: { userId: string; amount: string; reason: string },
  ) {
    this.requireRole(admin, [AdminRole.FINANCE]);

    const user = await this.prisma.user.findUnique({
      where: { id: params.userId },
      select: { id: true },
    });
    if (!user) throw new NotFoundError('User');

    const amount = parseAmount(params.amount, 'USDT');

    const before = await this.ledger.getBalance(params.userId);

    const ledgerTransactionId = await this.ledger.postAdjustment({
      userId: params.userId,
      // Time-bounded key: a genuine second correction is allowed, an
      // accidental double-submit within the same second is not.
      idempotencyKey: `adjust:${params.userId}:${admin.id}:${Math.floor(Date.now() / 1000)}`,
      amount,
      reason: params.reason,
      adminUserId: admin.id,
    });

    const after = await this.ledger.getBalance(params.userId);

    await this.recordAction(admin, {
      type: AdminActionType.LEDGER_ADJUSTMENT,
      targetType: 'User',
      targetId: params.userId,
      reason: params.reason,
      amount,
      before: { available: before.available.toString() },
      after: { available: after.available.toString(), ledgerTransactionId },
    });

    this.logger.warn(
      `LEDGER ADJUSTMENT by ${admin.email}: ${amount} for user ${params.userId} — ${params.reason}`,
    );

    return {
      ledgerTransactionId,
      before: before.available.toString(),
      after: after.available.toString(),
    };
  }

  async listLedgerEntries(params: { userId?: string; limit?: number; cursor?: string }) {
    const limit = Math.min(params.limit ?? 50, 200);

    const transactions = await this.prisma.ledgerTransaction.findMany({
      where: params.userId
        ? { entries: { some: { account: { userId: params.userId } } } }
        : {},
      orderBy: { createdAt: 'desc' },
      take: limit + 1,
      ...(params.cursor ? { cursor: { id: params.cursor }, skip: 1 } : {}),
      include: {
        entries: {
          include: { account: { select: { kind: true, userId: true } } },
        },
      },
    });

    const hasMore = transactions.length > limit;
    const page = hasMore ? transactions.slice(0, limit) : transactions;

    return {
      data: page.map((t) => ({
        id: t.id,
        type: t.type,
        description: t.description,
        idempotencyKey: t.idempotencyKey,
        createdAt: t.createdAt.toISOString(),
        entries: t.entries.map((e) => ({
          direction: e.direction,
          amount: e.amount.toString(),
          currency: e.currency,
          accountKind: e.account.kind,
          userId: e.account.userId,
        })),
      })),
      nextCursor: hasMore ? page[page.length - 1].id : null,
      hasMore,
    };
  }

  // ----------------------------------------------------------- Deposits ----

  async listDeposits(params: { status?: string; limit?: number; cursor?: string }) {
    const limit = Math.min(params.limit ?? 25, 100);

    const deposits = await this.prisma.deposit.findMany({
      where: params.status ? { status: params.status as DepositStatus } : {},
      orderBy: { createdAt: 'desc' },
      take: limit + 1,
      ...(params.cursor ? { cursor: { id: params.cursor }, skip: 1 } : {}),
      include: { user: { select: { email: true } } },
    });

    const hasMore = deposits.length > limit;
    const page = hasMore ? deposits.slice(0, limit) : deposits;

    return {
      data: page.map((d) => ({
        id: d.id,
        userEmail: d.user.email,
        userId: d.userId,
        amount: d.amount.toString(),
        currency: d.currency,
        network: d.network,
        address: d.toAddress,
        txHash: d.txHash,
        confirmations: d.confirmations,
        requiredConfirmations: d.requiredConfirmations,
        status: d.status,
        source: d.source,
        credited: !!d.ledgerTransactionId,
        createdAt: d.createdAt.toISOString(),
        confirmedAt: d.confirmedAt?.toISOString() ?? null,
      })),
      nextCursor: hasMore ? page[page.length - 1].id : null,
      hasMore,
    };
  }

  /**
   * Re-check a deposit against the chain. This does not credit anything by
   * itself — it re-runs the normal confirmation path, so the same
   * once-only guarantees apply.
   */
  async retryDepositReconciliation(admin: RequestAdmin, depositId: string, reason: string) {
    this.requireRole(admin, [AdminRole.ADMIN, AdminRole.FINANCE]);

    const deposit = await this.prisma.deposit.findUnique({
      where: { id: depositId },
      select: { id: true, addressId: true, status: true },
    });
    if (!deposit) throw new NotFoundError('Deposit');

    await this.deposits.advanceConfirmations(deposit.id);

    if (deposit.addressId) {
      await this.deposits.reconcileAddress(deposit.addressId);
    }

    const after = await this.prisma.deposit.findUnique({
      where: { id: depositId },
      select: { status: true, confirmations: true },
    });

    await this.recordAction(admin, {
      type: AdminActionType.RETRY_DEPOSIT_RECONCILIATION,
      targetType: 'Deposit',
      targetId: depositId,
      reason,
      before: { status: deposit.status },
      after,
    });

    return after;
  }

  // -------------------------------------------------------------- Cards ----

  async listCards(params: { status?: string; limit?: number; cursor?: string }) {
    const limit = Math.min(params.limit ?? 25, 100);

    const cards = await this.prisma.card.findMany({
      where: params.status ? { status: params.status as CardStatus } : {},
      orderBy: { createdAt: 'desc' },
      take: limit + 1,
      ...(params.cursor ? { cursor: { id: params.cursor }, skip: 1 } : {}),
      include: {
        user: { select: { email: true, id: true } },
        _count: { select: { transactions: true } },
      },
    });

    const hasMore = cards.length > limit;
    const page = hasMore ? cards.slice(0, limit) : cards;

    return {
      data: page.map((c) => ({
        id: c.id,
        name: c.name,
        // Last four only — a full PAN is never available to staff.
        lastFour: c.lastFour,
        status: c.status,
        userEmail: c.user.email,
        userId: c.user.id,
        providerCardToken: c.providerCardToken,
        dailyLimit: c.dailyLimit?.toString() ?? null,
        monthlyLimit: c.monthlyLimit?.toString() ?? null,
        transactionCount: c._count.transactions,
        lastSyncedAt: c.lastSyncedAt?.toISOString() ?? null,
        createdAt: c.createdAt.toISOString(),
      })),
      nextCursor: hasMore ? page[page.length - 1].id : null,
      hasMore,
    };
  }

  async freezeCard(admin: RequestAdmin, cardId: string, reason: string) {
    this.requireRole(admin, [AdminRole.ADMIN, AdminRole.RISK]);

    const card = await this.prisma.card.findUnique({
      where: { id: cardId },
      select: { id: true, status: true, providerCardToken: true },
    });
    if (!card) throw new NotFoundError('Card');

    await this.cardProvider.setCardState(card.providerCardToken, 'FROZEN');

    const updated = await this.prisma.card.update({
      where: { id: cardId },
      data: { status: CardStatus.FROZEN, lastSyncedAt: new Date() },
      select: { id: true, status: true },
    });

    await this.recordAction(admin, {
      type: AdminActionType.FREEZE_CARD,
      targetType: 'Card',
      targetId: cardId,
      reason,
      before: { status: card.status },
      after: updated,
    });

    return updated;
  }

  // ----------------------------------------------------------- Webhooks ----

  async listWebhooks(params: { status?: string; provider?: string; limit?: number }) {
    const limit = Math.min(params.limit ?? 50, 200);

    return this.prisma.webhookEvent.findMany({
      where: {
        ...(params.status ? { status: params.status as WebhookStatus } : {}),
        ...(params.provider ? { provider: params.provider as 'LITHIC' | 'ALCHEMY' } : {}),
      },
      orderBy: { receivedAt: 'desc' },
      take: limit,
      select: {
        id: true, provider: true, eventId: true, eventType: true,
        status: true, retryCount: true, error: true,
        receivedAt: true, processedAt: true,
      },
    });
  }

  async replayWebhook(admin: RequestAdmin, webhookEventId: string, reason: string) {
    this.requireRole(admin, [AdminRole.ADMIN]);

    await this.webhooks.replay(webhookEventId);

    const after = await this.prisma.webhookEvent.findUnique({
      where: { id: webhookEventId },
      select: { status: true, error: true },
    });

    await this.recordAction(admin, {
      type: AdminActionType.REPLAY_WEBHOOK,
      targetType: 'WebhookEvent',
      targetId: webhookEventId,
      reason,
      after,
    });

    return after;
  }

  // -------------------------------------------------------------- Audit ----

  async listAuditLogs(params: { limit?: number; cursor?: string; entityId?: string }) {
    const limit = Math.min(params.limit ?? 50, 200);

    const logs = await this.prisma.auditLog.findMany({
      where: params.entityId ? { entityId: params.entityId } : {},
      orderBy: { createdAt: 'desc' },
      take: limit + 1,
      ...(params.cursor ? { cursor: { id: params.cursor }, skip: 1 } : {}),
      include: { adminUser: { select: { email: true, name: true, role: true } } },
    });

    const hasMore = logs.length > limit;
    const page = hasMore ? logs.slice(0, limit) : logs;

    return {
      data: page,
      nextCursor: hasMore ? page[page.length - 1].id : null,
      hasMore,
    };
  }

  // ------------------------------------------------------------- Health ----

  async health() {
    const [database, cardProvider, blockchain, integrity, queue] = await Promise.all([
      this.prisma.healthCheck(),
      this.cardProvider.healthCheck(),
      this.chain.healthCheck(),
      this.ledger.verifyIntegrity(),
      this.prisma.webhookEvent.groupBy({
        by: ['status'],
        _count: { _all: true },
      }),
    ]);

    return {
      database,
      cardProvider: { name: this.cardProvider.name, ...cardProvider },
      blockchain: { name: this.chain.name, network: this.chain.network, ...blockchain },
      ledgerIntegrity: integrity,
      webhookQueue: Object.fromEntries(
        queue.map((row) => [row.status, row._count._all]),
      ),
      checkedAt: new Date().toISOString(),
    };
  }

  // ------------------------------------------------------------- Shared ----

  /** SUPER_ADMIN satisfies every requirement; others must match exactly. */
  private requireRole(admin: RequestAdmin, allowed: AdminRole[]): void {
    if (admin.role === AdminRole.SUPER_ADMIN) return;
    if (!allowed.includes(admin.role)) {
      throw new ForbiddenError('Your role does not permit this action.');
    }
  }

  private async recordAction(
    admin: RequestAdmin,
    params: {
      type: AdminActionType;
      targetType: string;
      targetId: string;
      reason: string;
      amount?: bigint;
      before?: unknown;
      after?: unknown;
    },
  ): Promise<void> {
    await this.prisma.$transaction([
      this.prisma.adminAction.create({
        data: {
          adminUserId: admin.id,
          type: params.type,
          targetType: params.targetType,
          targetId: params.targetId,
          reason: params.reason,
          amount: params.amount,
        },
      }),
      this.prisma.auditLog.create({
        data: {
          adminUserId: admin.id,
          actorType: 'ADMIN',
          actorId: admin.id,
          action: params.type,
          entityType: params.targetType,
          entityId: params.targetId,
          reason: params.reason,
          before: (params.before ?? Prisma.JsonNull) as Prisma.InputJsonValue,
          after: (params.after ?? Prisma.JsonNull) as Prisma.InputJsonValue,
        },
      }),
    ]);
  }
}
