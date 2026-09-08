import { Injectable } from '@nestjs/common';
import {
  CardTransactionStatus,
  DepositSource,
  DepositStatus,
  LedgerTransactionType,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { LedgerService } from '../ledger/ledger.service';
import type { TransactionQuery } from '@tenzopay/shared';

/**
 * The unified transaction feed.
 *
 * Card spend, deposits, fees and adjustments live in different tables because
 * they carry different data. This service merges them into one chronological
 * view for the UI.
 *
 * Sign convention: `amount` is signed relative to the user's AVAILABLE balance.
 * A deposit is positive; card spend is negative. That way the UI never has to
 * infer direction from the row type.
 */
@Injectable()
export class TransactionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ledger: LedgerService,
  ) {}

  async list(userId: string, query: TransactionQuery) {
    const limit = query.limit;
    const from = query.from ? new Date(query.from) : undefined;
    const to = query.to ? new Date(query.to) : undefined;

    const wantsCard = query.type === 'all' || query.type === 'card' || query.type === 'refunds';
    const wantsDeposits = query.type === 'all' || query.type === 'deposits';
    const wantsFees = query.type === 'all' || query.type === 'fees';

    /**
     * The cursor is the `createdAt` of the last row already delivered.
     *
     * It has to be a timestamp rather than a row id because this feed merges
     * three tables: an id-based cursor is only meaningful within one of them.
     * Cursor-based paging also survives new transactions arriving mid-scroll,
     * which OFFSET does not — that would skip or repeat rows.
     */
    const cursorDate = query.cursor ? new Date(query.cursor) : undefined;
    const validCursor =
      cursorDate && !Number.isNaN(cursorDate.getTime()) ? cursorDate : undefined;

    // `to` and the cursor both bound the window from above; take the tighter.
    const upperBound =
      validCursor && to ? (validCursor < to ? validCursor : to) : (validCursor ?? to);

    const dateFilter =
      from || upperBound
        ? {
            createdAt: {
              ...(from ? { gte: from } : {}),
              // The cursor row itself was already returned, so exclude it.
              ...(upperBound ? (validCursor ? { lt: upperBound } : { lte: upperBound }) : {}),
            },
          }
        : {};

    // Over-fetch each source, merge, then trim — the merged order is what the
    // user sees, so paginating a single source would drop rows.
    const fetchSize = limit * 2;

    const [cardRows, depositRows, feeRows] = await Promise.all([
      wantsCard
        ? this.prisma.cardTransaction.findMany({
            where: {
              userId,
              ...dateFilter,
              ...(query.cardId ? { cardId: query.cardId } : {}),
              ...(query.status
                ? { status: query.status as CardTransactionStatus }
                : {}),
              ...(query.type === 'refunds'
                ? { status: CardTransactionStatus.REFUNDED }
                : {}),
            },
            orderBy: { createdAt: 'desc' },
            take: fetchSize,
            include: { card: { select: { name: true, lastFour: true } } },
          })
        : Promise.resolve([]),

      wantsDeposits && !query.cardId
        ? this.prisma.deposit.findMany({
            where: {
              userId,
              ...dateFilter,
              ...(query.status ? { status: query.status as DepositStatus } : {}),
            },
            orderBy: { createdAt: 'desc' },
            take: fetchSize,
          })
        : Promise.resolve([]),

      wantsFees && !query.cardId
        ? this.prisma.fee.findMany({
            where: { userId, ...dateFilter },
            orderBy: { createdAt: 'desc' },
            take: fetchSize,
          })
        : Promise.resolve([]),
    ]);

    const rows = [
      ...cardRows.map((t) => ({
        id: t.id,
        kind: 'CARD' as const,
        description: t.merchantName ?? 'Card transaction',
        // Card amounts are USD cents; present them in USDT minor units so
        // every figure in the feed shares one unit.
        amount: (-(t.settledAmount ?? t.amount) * 10_000n).toString(),
        currency: 'USDT',
        status: t.status,
        cardName: t.card?.name ?? null,
        cardLastFour: t.card?.lastFour ?? null,
        reference: t.providerTransactionToken,
        createdAt: t.createdAt.toISOString(),
        settledAt: t.settledAt?.toISOString() ?? null,
      })),

      ...depositRows.map((d) => ({
        id: d.id,
        kind: 'DEPOSIT' as const,
        description:
          d.source === DepositSource.DEMO ? 'USDT deposit (demo)' : 'USDT deposit',
        amount: d.amount.toString(),
        currency: d.currency,
        status: d.status,
        cardName: null,
        cardLastFour: null,
        reference: d.txHash,
        createdAt: d.createdAt.toISOString(),
        settledAt: d.confirmedAt?.toISOString() ?? null,
      })),

      ...feeRows.map((f) => ({
        id: f.id,
        kind: 'FEE' as const,
        description: f.description ?? 'Fee',
        amount: (-f.amount).toString(),
        currency: f.currency,
        status: 'SETTLED',
        cardName: null,
        cardLastFour: null,
        reference: null,
        createdAt: f.createdAt.toISOString(),
        settledAt: f.createdAt.toISOString(),
      })),
    ].sort((a, b) => b.createdAt.localeCompare(a.createdAt));

    const page = rows.slice(0, limit);
    const hasMore = rows.length > limit;

    return {
      data: page,
      // Only advertise a cursor when there is genuinely another page; handing
      // one back on the final page makes clients fetch an empty result.
      nextCursor: hasMore && page.length ? page[page.length - 1].createdAt : null,
      hasMore,
    };
  }

  async getCardTransaction(userId: string, id: string) {
    return this.prisma.cardTransaction.findFirst({
      where: { id, userId },
      include: {
        card: { select: { name: true, lastFour: true } },
        authorizations: {
          select: {
            decision: true,
            reason: true,
            amount: true,
            createdAt: true,
            latencyMs: true,
          },
          orderBy: { createdAt: 'desc' },
        },
      },
    });
  }

  /**
   * Spending totals for the dashboard chart, bucketed by day.
   *
   * Computed from settled + pending card spend, which is what the user
   * experiences as "spent", rather than from ledger settlement postings that
   * lag the authorization.
   */
  async spendingOverview(userId: string, days: 1 | 7 | 30) {
    const since = new Date();
    since.setHours(0, 0, 0, 0);
    since.setDate(since.getDate() - (days - 1));

    const rows = await this.prisma.cardTransaction.findMany({
      where: {
        userId,
        createdAt: { gte: since },
        status: {
          in: [CardTransactionStatus.PENDING, CardTransactionStatus.SETTLED],
        },
      },
      select: { amount: true, settledAmount: true, status: true, createdAt: true },
    });

    const buckets = new Map<string, bigint>();
    for (let i = 0; i < days; i++) {
      const d = new Date(since);
      d.setDate(since.getDate() + i);
      buckets.set(d.toISOString().slice(0, 10), 0n);
    }

    let total = 0n;
    for (const row of rows) {
      const key = row.createdAt.toISOString().slice(0, 10);
      const value =
        row.status === CardTransactionStatus.SETTLED && row.settledAmount !== null
          ? row.settledAmount
          : row.amount;
      buckets.set(key, (buckets.get(key) ?? 0n) + value);
      total += value;
    }

    return {
      days,
      // USD cents -> USDT minor units, so the chart matches the balance card.
      total: (total * 10_000n).toString(),
      points: [...buckets.entries()].map(([date, cents]) => ({
        date,
        amount: (cents * 10_000n).toString(),
      })),
    };
  }

  /** Balance plus headline figures for the dashboard. */
  async overview(userId: string) {
    const balance = await this.ledger.getBalance(userId);

    const [cardCount, frozenCount, pendingDeposits] = await Promise.all([
      this.prisma.card.count({ where: { userId, status: 'ACTIVE' } }),
      this.prisma.card.count({ where: { userId, status: 'FROZEN' } }),
      this.prisma.deposit.count({
        where: {
          userId,
          status: { in: [DepositStatus.DETECTED, DepositStatus.CONFIRMING] },
        },
      }),
    ]);

    return {
      balance: {
        currency: balance.currency,
        available: balance.available.toString(),
        held: balance.held.toString(),
        total: balance.total.toString(),
      },
      activeCards: cardCount,
      frozenCards: frozenCount,
      pendingDeposits,
    };
  }
}
