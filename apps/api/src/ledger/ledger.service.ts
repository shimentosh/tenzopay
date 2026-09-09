import { Injectable, Logger } from '@nestjs/common';
import {
  FeeType,
  LedgerAccountKind,
  LedgerDirection,
  LedgerTransactionType,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { InsufficientBalanceError, LedgerImbalanceError } from '../common/errors';

/**
 * The double-entry ledger. This is the source of truth for customer funds.
 *
 * Invariants enforced here and asserted by the reconciliation job:
 *   I1. Every LedgerTransaction's entries sum to zero.
 *   I2. Entries are immutable — there is no update or delete path.
 *   I3. Amounts are positive bigints; LedgerDirection carries the sign.
 *   I4. Posting is idempotent on LedgerTransaction.idempotencyKey.
 *   I5. A user's available balance may never go negative.
 *
 * Balances are always DERIVED by summing entries. There is deliberately no
 * `balance` column anywhere in the schema, because a cached balance is the
 * single most common source of money bugs.
 */

export interface EntryInput {
  accountId: string;
  direction: LedgerDirection;
  /** Positive minor units. */
  amount: bigint;
  currency?: string;
}

export interface PostTransactionInput {
  type: LedgerTransactionType;
  /**
   * Natural key of the underlying real-world event, e.g.
   *   `deposit:${depositId}:confirm`
   *   `auth:${lithicEventToken}`
   * Re-posting with the same key is a no-op that returns the original row.
   */
  idempotencyKey: string;
  entries: EntryInput[];
  description?: string;
  metadata?: Prisma.InputJsonValue;
}

export interface BalanceSnapshot {
  currency: string;
  available: bigint;
  held: bigint;
  total: bigint;
}

/** Any Prisma client or interactive-transaction client. */
type Db = Prisma.TransactionClient | PrismaService;

@Injectable()
export class LedgerService {
  private readonly logger = new Logger(LedgerService.name);

  constructor(private readonly prisma: PrismaService) {}

  // -------------------------------------------------------------------------
  // Account resolution
  // -------------------------------------------------------------------------

  /**
   * Get or create a ledger account. Safe under concurrency: the unique
   * constraint on (kind, userId, currency) turns a race into a P2002 we absorb.
   */
  async ensureAccount(
    kind: LedgerAccountKind,
    userId: string | null,
    currency = 'USDT',
    db: Db = this.prisma,
  ): Promise<string> {
    const existing = await db.ledgerAccount.findFirst({
      where: { kind, userId, currency },
      select: { id: true },
    });
    if (existing) return existing.id;

    try {
      const created = await db.ledgerAccount.create({
        data: { kind, userId, currency },
        select: { id: true },
      });
      return created.id;
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        const raced = await db.ledgerAccount.findFirstOrThrow({
          where: { kind, userId, currency },
          select: { id: true },
        });
        return raced.id;
      }
      throw err;
    }
  }

  async ensureUserAccounts(userId: string, currency = 'USDT'): Promise<void> {
    await this.ensureAccount(LedgerAccountKind.USER_AVAILABLE, userId, currency);
    await this.ensureAccount(LedgerAccountKind.USER_HELD, userId, currency);
  }

  // -------------------------------------------------------------------------
  // Posting
  // -------------------------------------------------------------------------

  /**
   * Post a balanced set of entries.
   *
   * Idempotent: if `idempotencyKey` already exists the existing transaction id
   * is returned and nothing new is written. Callers may therefore retry freely,
   * which is what makes webhook redelivery safe.
   */
  async post(input: PostTransactionInput, db: Db = this.prisma): Promise<string> {
    this.assertBalanced(input.entries);

    // Fast path. Also the ONLY safe place to look this up when `db` is an
    // interactive transaction: once a duplicate-key error fires inside a
    // Postgres transaction the whole transaction is aborted (SQLSTATE 25P02)
    // and every subsequent query on that connection fails. So the check has to
    // happen before the insert, and a genuine race is resolved by the caller
    // outside the transaction — see `resolveDuplicate`.
    const existing = await db.ledgerTransaction.findUnique({
      where: { idempotencyKey: input.idempotencyKey },
      select: { id: true },
    });
    if (existing) {
      this.logger.debug(`Ledger post deduplicated for key ${input.idempotencyKey}`);
      return existing.id;
    }

    try {
      const created = await db.ledgerTransaction.create({
        data: {
          type: input.type,
          idempotencyKey: input.idempotencyKey,
          description: input.description,
          metadata: input.metadata ?? Prisma.JsonNull,
          entries: {
            create: input.entries.map((e) => ({
              accountId: e.accountId,
              direction: e.direction,
              amount: e.amount,
              currency: e.currency ?? 'USDT',
            })),
          },
        },
        select: { id: true },
      });
      return created.id;
    } catch (err) {
      // A true race: another writer inserted the same key between our check
      // and our insert. Do NOT query here — the transaction is already
      // aborted. Rethrow so the caller can resolve it on a clean connection.
      throw err;
    }
  }

  /**
   * Is this a transient serialization conflict rather than a real failure?
   *
   * SERIALIZABLE isolation does not queue conflicting transactions — it aborts
   * one of them and expects the caller to retry. Postgres raises
   * `40001 serialization_failure` or `40P01 deadlock_detected`; Prisma surfaces
   * both as P2034.
   *
   * Not retrying is a correctness bug that only appears under load: two
   * simultaneous authorizations on one balance, one gets aborted, and the
   * cardholder sees a decline despite having ample funds.
   */
  private isSerializationConflict(err: unknown): boolean {
    if (err instanceof Prisma.PrismaClientKnownRequestError) {
      if (err.code === 'P2034') return true;
      const pgCode = (err.meta as { code?: string } | undefined)?.code;
      if (pgCode === '40001' || pgCode === '40P01') return true;
    }

    /**
     * Match on Prisma's wording as well as Postgres's.
     *
     * Prisma collapses both conditions into one message — "Transaction failed
     * due to a write conflict or a deadlock" — which does NOT contain
     * Postgres's own phrase "deadlock detected". Matching only the Postgres
     * wording silently let deadlocks through unretried, and they surfaced to
     * cardholders as declines.
     */
    const message = (err instanceof Error ? err.message : String(err)).toLowerCase();
    return (
      message.includes('could not serialize') ||
      message.includes('deadlock') ||
      message.includes('write conflict') ||
      message.includes('40001') ||
      message.includes('40p01')
    );
  }

  /**
   * Run a balance-affecting transaction, retrying transient write conflicts.
   *
   * Bounded tightly on purpose: ASA has roughly a 3-second budget before Lithic
   * declines, so the retries have to fit inside it with room to spare. Backoff
   * is jittered because synchronised retries would simply collide again.
   */
  private async withSerializableRetry<T>(
    operation: () => Promise<T>,
    label: string,
    maxAttempts = 8,
  ): Promise<T> {
    let lastError: unknown;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      try {
        const result = await operation();

        if (attempt > 0) {
          this.logger.warn(`${label}: succeeded after ${attempt + 1} attempts`);
        }
        return result;
      } catch (err) {
        if (!this.isSerializationConflict(err)) throw err;

        lastError = err;

        if (attempt < maxAttempts - 1) {
          /**
           * Full jitter, capped at 150ms per wait.
           *
           * The budget is generous because the alternative is a wrongly
           * declined payment: a decision normally takes ~20ms against Lithic's
           * ~3s window, so even a worst-case run of retries lands around
           * 600ms — comfortably inside it. Jitter matters more than the
           * ceiling: synchronised retries just collide again.
           */
          const base = Math.min(8 * 2 ** attempt, 150);
          await new Promise((resolve) => setTimeout(resolve, Math.random() * base));
        }
      }
    }

    this.logger.error(
      `${label}: exhausted ${maxAttempts} attempts on serialization conflicts`,
    );
    throw lastError;
  }

  /**
   * Resolve a lost idempotency race on a clean connection.
   *
   * Returns the winning transaction's id if the key now exists, or rethrows
   * the original error when the failure was something else entirely.
   */
  private async resolveDuplicate(
    err: unknown,
    idempotencyKey: string,
  ): Promise<string> {
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === 'P2002'
    ) {
      const existing = await this.prisma.ledgerTransaction.findUnique({
        where: { idempotencyKey },
        select: { id: true },
      });
      if (existing) {
        this.logger.debug(`Ledger post race resolved for key ${idempotencyKey}`);
        return existing.id;
      }
    }
    throw err;
  }

  /** I1: entries must net to zero, and every amount must be a positive bigint. */
  private assertBalanced(entries: EntryInput[]): void {
    if (entries.length < 2) {
      throw new LedgerImbalanceError('A ledger transaction needs at least two entries');
    }

    let net = 0n;
    for (const e of entries) {
      if (e.amount <= 0n) {
        throw new LedgerImbalanceError(
          'Ledger amounts must be positive; use direction to express sign',
        );
      }
      net += e.direction === LedgerDirection.CREDIT ? e.amount : -e.amount;
    }

    if (net !== 0n) {
      throw new LedgerImbalanceError(
        `Ledger transaction does not balance (net ${net})`,
      );
    }
  }

  // -------------------------------------------------------------------------
  // Balances
  // -------------------------------------------------------------------------

  /** Balance of one account = SUM(credits) - SUM(debits). */
  async getAccountBalance(accountId: string, db: Db = this.prisma): Promise<bigint> {
    const rows = await db.ledgerEntry.groupBy({
      by: ['direction'],
      where: { accountId },
      _sum: { amount: true },
    });

    let balance = 0n;
    for (const row of rows) {
      const sum = row._sum.amount ?? 0n;
      balance += row.direction === LedgerDirection.CREDIT ? sum : -sum;
    }
    return balance;
  }

  async getBalance(
    userId: string,
    currency = 'USDT',
    db: Db = this.prisma,
  ): Promise<BalanceSnapshot> {
    const accounts = await db.ledgerAccount.findMany({
      where: {
        userId,
        currency,
        kind: { in: [LedgerAccountKind.USER_AVAILABLE, LedgerAccountKind.USER_HELD] },
      },
      select: { id: true, kind: true },
    });

    let available = 0n;
    let held = 0n;

    for (const account of accounts) {
      const balance = await this.getAccountBalance(account.id, db);
      if (account.kind === LedgerAccountKind.USER_AVAILABLE) available = balance;
      else held = balance;
    }

    return { currency, available, held, total: available + held };
  }

  // -------------------------------------------------------------------------
  // Money movements
  // -------------------------------------------------------------------------

  /** Credit a confirmed deposit into the user's available balance. */
  async creditDeposit(params: {
    userId: string;
    depositId: string;
    amount: bigint;
    /**
     * Deducted from the deposit before it is credited, so the user is credited
     * net. Taking it from the incoming money rather than from the existing
     * balance means a deposit fee can never overdraw an account.
     */
    feeAmount?: bigint;
    currency?: string;
    metadata?: Prisma.InputJsonValue;
  }): Promise<string> {
    const currency = params.currency ?? 'USDT';
    const idempotencyKey = `deposit:${params.depositId}:confirm`;

    try {
      return await this.prisma.$transaction(async (tx) => {
        const userAvailable = await this.ensureAccount(
          LedgerAccountKind.USER_AVAILABLE,
          params.userId,
          currency,
          tx,
        );
        const clearing = await this.ensureAccount(
          LedgerAccountKind.SYSTEM_DEPOSIT_CLEARING,
          null,
          currency,
          tx,
        );

        const fee = params.feeAmount ?? 0n;
        if (fee < 0n || fee > params.amount) {
          throw new Error('Deposit fee must be between zero and the deposit amount');
        }

        const entries: EntryInput[] = [
          { accountId: clearing, direction: LedgerDirection.DEBIT, amount: params.amount, currency },
          {
            accountId: userAvailable,
            direction: LedgerDirection.CREDIT,
            amount: params.amount - fee,
            currency,
          },
        ];

        if (fee > 0n) {
          const feeRevenue = await this.ensureAccount(
            LedgerAccountKind.SYSTEM_FEE_REVENUE,
            null,
            currency,
            tx,
          );
          entries.push({
            accountId: feeRevenue,
            direction: LedgerDirection.CREDIT,
            amount: fee,
            currency,
          });
        }

        const ledgerTransactionId = await this.post(
          {
            type: LedgerTransactionType.DEPOSIT_CONFIRMED,
            idempotencyKey,
            description: 'USDT deposit confirmed',
            metadata: params.metadata,
            entries,
          },
          tx,
        );

        // Inside the same transaction on purpose: a fee must not be able to
        // exist without its posting, nor a posting without its fee record.
        if (fee > 0n) {
          await tx.fee.create({
            data: {
              userId: params.userId,
              type: FeeType.DEPOSIT,
              amount: fee,
              currency,
              ledgerTransactionId,
              description: 'Deposit fee',
            },
          });
        }

        return ledgerTransactionId;
      });
    } catch (err) {
      return this.resolveDuplicate(err, idempotencyKey);
    }
  }

  /**
   * Charge a fee straight from the available balance.
   *
   * Used where there is nothing to reserve the fee against — issuing a card,
   * or a monthly plan charge. Runs at SERIALIZABLE for the same reason a hold
   * does: the read of the balance and the write that spends it must not be
   * separable, or two concurrent charges both pass and overdraw the account.
   *
   * Throws InsufficientBalanceError rather than letting a balance go negative.
   * The caller decides what that means — card creation refuses; a scheduled
   * plan charge would retry later.
   */
  async chargeFee(params: {
    userId: string;
    idempotencyKey: string;
    amount: bigint;
    feeType: FeeType;
    description: string;
    currency?: string;
    metadata?: Prisma.InputJsonValue;
  }): Promise<string> {
    const currency = params.currency ?? 'USDT';
    if (params.amount <= 0n) {
      throw new Error('A fee charge must be positive');
    }

    try {
      return await this.withSerializableRetry(
        () =>
          this.prisma.$transaction(
            async (tx) => {
              const existing = await tx.ledgerTransaction.findUnique({
                where: { idempotencyKey: params.idempotencyKey },
                select: { id: true },
              });
              if (existing) return existing.id;

              const availableId = await this.ensureAccount(
                LedgerAccountKind.USER_AVAILABLE, params.userId, currency, tx,
              );
              const feeRevenueId = await this.ensureAccount(
                LedgerAccountKind.SYSTEM_FEE_REVENUE, null, currency, tx,
              );

              const available = await this.getAccountBalance(availableId, tx);
              if (available < params.amount) {
                throw new InsufficientBalanceError(available, params.amount);
              }

              const ledgerTransactionId = await this.post(
                {
                  type: LedgerTransactionType.FEE,
                  idempotencyKey: params.idempotencyKey,
                  description: params.description,
                  metadata: params.metadata,
                  entries: [
                    { accountId: availableId, direction: LedgerDirection.DEBIT, amount: params.amount, currency },
                    { accountId: feeRevenueId, direction: LedgerDirection.CREDIT, amount: params.amount, currency },
                  ],
                },
                tx,
              );

              await tx.fee.create({
                data: {
                  userId: params.userId,
                  type: params.feeType,
                  amount: params.amount,
                  currency,
                  ledgerTransactionId,
                  description: params.description,
                },
              });

              return ledgerTransactionId;
            },
            { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 5_000 },
          ),
        `chargeFee(${params.idempotencyKey})`,
      );
    } catch (err) {
      if (err instanceof InsufficientBalanceError) throw err;
      return this.resolveDuplicate(err, params.idempotencyKey);
    }
  }

  /**
   * Place an authorization hold: available -> held.
   *
   * Runs at SERIALIZABLE isolation because two concurrent authorizations on
   * different cards share one balance; read-then-write under a weaker level
   * would let both pass and overdraw the account.
   *
   * Throws InsufficientBalanceError if the hold would overdraw (I5).
   */
  async placeHold(params: {
    userId: string;
    idempotencyKey: string;
    amount: bigint;
    currency?: string;
    description?: string;
    metadata?: Prisma.InputJsonValue;
  }): Promise<{ ledgerTransactionId: string; availableAfter: bigint }> {
    const currency = params.currency ?? 'USDT';

    try {
      return await this.withSerializableRetry(
        () => this.prisma.$transaction(
      async (tx) => {
        // If this exact authorization was already held, return it unchanged.
        const existing = await tx.ledgerTransaction.findUnique({
          where: { idempotencyKey: params.idempotencyKey },
          select: { id: true },
        });
        if (existing) {
          const balance = await this.getBalance(params.userId, currency, tx);
          return { ledgerTransactionId: existing.id, availableAfter: balance.available };
        }

        const availableId = await this.ensureAccount(
          LedgerAccountKind.USER_AVAILABLE,
          params.userId,
          currency,
          tx,
        );
        const heldId = await this.ensureAccount(
          LedgerAccountKind.USER_HELD,
          params.userId,
          currency,
          tx,
        );

        const available = await this.getAccountBalance(availableId, tx);
        if (available < params.amount) {
          throw new InsufficientBalanceError(available, params.amount);
        }

        const ledgerTransactionId = await this.post(
          {
            type: LedgerTransactionType.CARD_AUTHORIZATION,
            idempotencyKey: params.idempotencyKey,
            description: params.description ?? 'Card authorization hold',
            metadata: params.metadata,
            entries: [
              { accountId: availableId, direction: LedgerDirection.DEBIT, amount: params.amount, currency },
              { accountId: heldId, direction: LedgerDirection.CREDIT, amount: params.amount, currency },
            ],
          },
          tx,
        );

        return { ledgerTransactionId, availableAfter: available - params.amount };
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        // Short: ASA must answer inside ~3s, and a hold that takes longer than
        // this has already lost the race regardless of the outcome.
        timeout: 5_000,
      },
        ),
        `placeHold(${params.idempotencyKey})`,
      );
    } catch (err) {
      // Two concurrent deliveries of the same authorization. Resolve on a
      // clean connection and report the balance as it now stands.
      const ledgerTransactionId = await this.resolveDuplicate(
        err,
        params.idempotencyKey,
      );
      const balance = await this.getBalance(params.userId, currency);
      return { ledgerTransactionId, availableAfter: balance.available };
    }
  }

  /** Release a hold back to available (void, expiry, or partial reversal). */
  async releaseHold(params: {
    userId: string;
    idempotencyKey: string;
    amount: bigint;
    currency?: string;
    description?: string;
  }): Promise<string> {
    const currency = params.currency ?? 'USDT';

    try {
      return await this.prisma.$transaction(async (tx) => {
        const availableId = await this.ensureAccount(
          LedgerAccountKind.USER_AVAILABLE, params.userId, currency, tx,
        );
        const heldId = await this.ensureAccount(
          LedgerAccountKind.USER_HELD, params.userId, currency, tx,
        );

        return this.post(
          {
            type: LedgerTransactionType.CARD_AUTHORIZATION_REVERSAL,
            idempotencyKey: params.idempotencyKey,
            description: params.description ?? 'Authorization reversed',
            entries: [
              { accountId: heldId, direction: LedgerDirection.DEBIT, amount: params.amount, currency },
              { accountId: availableId, direction: LedgerDirection.CREDIT, amount: params.amount, currency },
            ],
          },
          tx,
        );
      });
    } catch (err) {
      return this.resolveDuplicate(err, params.idempotencyKey);
    }
  }

  /**
   * Settle a cleared card transaction: held -> card settlement.
   *
   * `heldAmount` is what was originally reserved and `settledAmount` what the
   * merchant actually cleared. Any difference is returned to available, which
   * is the common case for tips, fuel holds, and partial captures.
   */
  async settleAuthorization(params: {
    userId: string;
    idempotencyKey: string;
    heldAmount: bigint;
    settledAmount: bigint;
    /**
     * The transaction fee, already reserved inside `heldAmount` when the
     * authorization was approved. Collecting it here rather than charging it
     * separately is what stops a fee overdrawing an account that has just
     * spent its last unit.
     */
    feeAmount?: bigint;
    currency?: string;
    description?: string;
    metadata?: Prisma.InputJsonValue;
  }): Promise<string> {
    const currency = params.currency ?? 'USDT';
    const { heldAmount, settledAmount } = params;
    const fee = params.feeAmount ?? 0n;

    try {
      return await this.prisma.$transaction(async (tx) => {
      const availableId = await this.ensureAccount(
        LedgerAccountKind.USER_AVAILABLE, params.userId, currency, tx,
      );
      const heldId = await this.ensureAccount(
        LedgerAccountKind.USER_HELD, params.userId, currency, tx,
      );
      const settlementId = await this.ensureAccount(
        LedgerAccountKind.SYSTEM_CARD_SETTLEMENT, null, currency, tx,
      );

      const entries: EntryInput[] = [
        { accountId: heldId, direction: LedgerDirection.DEBIT, amount: heldAmount, currency },
      ];

      if (settledAmount > 0n) {
        entries.push({
          accountId: settlementId, direction: LedgerDirection.CREDIT, amount: settledAmount, currency,
        });
      }

      if (fee > 0n) {
        const feeRevenue = await this.ensureAccount(
          LedgerAccountKind.SYSTEM_FEE_REVENUE, null, currency, tx,
        );
        entries.push({
          accountId: feeRevenue, direction: LedgerDirection.CREDIT, amount: fee, currency,
        });
      }

      /**
       * Whatever the hold does not cover is settled from available; whatever
       * it over-covers goes back. The fee is part of what the hold has to
       * cover, so it sits on this side of the sum rather than being charged
       * on its own.
       */
      const remainder = heldAmount - settledAmount - fee;

      if (remainder < 0n) {
        entries.push({
          accountId: availableId,
          direction: LedgerDirection.DEBIT,
          amount: -remainder,
          currency,
        });
      } else if (remainder > 0n) {
        entries.push({
          accountId: availableId,
          direction: LedgerDirection.CREDIT,
          amount: remainder,
          currency,
        });
      }

      const ledgerTransactionId = await this.post(
        {
          type: LedgerTransactionType.CARD_SETTLEMENT,
          idempotencyKey: params.idempotencyKey,
          description: params.description ?? 'Card transaction settled',
          metadata: params.metadata,
          entries,
        },
        tx,
      );

      if (fee > 0n) {
        await tx.fee.create({
          data: {
            userId: params.userId,
            type: FeeType.FX,
            amount: fee,
            currency,
            ledgerTransactionId,
            description: params.description ?? 'Card transaction fee',
          },
        });
      }

      return ledgerTransactionId;
      });
    } catch (err) {
      return this.resolveDuplicate(err, params.idempotencyKey);
    }
  }

  /** Merchant refund — credits the user's available balance. */
  async creditRefund(params: {
    userId: string;
    idempotencyKey: string;
    amount: bigint;
    currency?: string;
    description?: string;
  }): Promise<string> {
    const currency = params.currency ?? 'USDT';

    try {
      return await this.prisma.$transaction(async (tx) => {
      const availableId = await this.ensureAccount(
        LedgerAccountKind.USER_AVAILABLE, params.userId, currency, tx,
      );
      const settlementId = await this.ensureAccount(
        LedgerAccountKind.SYSTEM_CARD_SETTLEMENT, null, currency, tx,
      );

      return this.post(
        {
          type: LedgerTransactionType.CARD_REFUND,
          idempotencyKey: params.idempotencyKey,
          description: params.description ?? 'Card refund',
          entries: [
            { accountId: settlementId, direction: LedgerDirection.DEBIT, amount: params.amount, currency },
            { accountId: availableId, direction: LedgerDirection.CREDIT, amount: params.amount, currency },
          ],
        },
        tx,
      );
      });
    } catch (err) {
      return this.resolveDuplicate(err, params.idempotencyKey);
    }
  }

  /**
   * Admin adjustment. Deliberately NOT a balance setter — it posts a normal
   * balanced pair against SYSTEM_ADJUSTMENT and is always paired with an
   * AdminAction row carrying a mandatory reason.
   */
  async postAdjustment(params: {
    userId: string;
    idempotencyKey: string;
    /** Signed: positive credits the user, negative debits them. */
    amount: bigint;
    reason: string;
    adminUserId: string;
    currency?: string;
  }): Promise<string> {
    const currency = params.currency ?? 'USDT';
    if (params.amount === 0n) {
      throw new LedgerImbalanceError('Adjustment amount cannot be zero');
    }

    const magnitude = params.amount < 0n ? -params.amount : params.amount;
    const isCredit = params.amount > 0n;

    try {
      return await this.withSerializableRetry(
        () => this.prisma.$transaction(
      async (tx) => {
        const availableId = await this.ensureAccount(
          LedgerAccountKind.USER_AVAILABLE, params.userId, currency, tx,
        );
        const adjustmentId = await this.ensureAccount(
          LedgerAccountKind.SYSTEM_ADJUSTMENT, null, currency, tx,
        );

        if (!isCredit) {
          const available = await this.getAccountBalance(availableId, tx);
          if (available < magnitude) {
            throw new InsufficientBalanceError(available, magnitude);
          }
        }

        return this.post(
          {
            type: LedgerTransactionType.ADMIN_ADJUSTMENT,
            idempotencyKey: params.idempotencyKey,
            description: `Admin adjustment: ${params.reason}`,
            metadata: { adminUserId: params.adminUserId, reason: params.reason },
            entries: isCredit
              ? [
                  { accountId: adjustmentId, direction: LedgerDirection.DEBIT, amount: magnitude, currency },
                  { accountId: availableId, direction: LedgerDirection.CREDIT, amount: magnitude, currency },
                ]
              : [
                  { accountId: availableId, direction: LedgerDirection.DEBIT, amount: magnitude, currency },
                  { accountId: adjustmentId, direction: LedgerDirection.CREDIT, amount: magnitude, currency },
                ],
          },
          tx,
        );
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
        ),
        `postAdjustment(${params.idempotencyKey})`,
      );
    } catch (err) {
      return this.resolveDuplicate(err, params.idempotencyKey);
    }
  }

  // -------------------------------------------------------------------------
  // Invariant checking (used by the reconciliation job and admin health page)
  // -------------------------------------------------------------------------

  /** Asserts I1 across every transaction and I5 across every user. */
  async verifyIntegrity(): Promise<{
    ok: boolean;
    checkedTransactions: number;
    unbalanced: string[];
    negativeBalances: string[];
  }> {
    const unbalanced = await this.prisma.$queryRaw<{ transaction_id: string }[]>`
      SELECT le."transactionId" AS transaction_id
      FROM ledger_entries le
      GROUP BY le."transactionId"
      HAVING COALESCE(SUM(CASE WHEN le.direction = 'CREDIT' THEN le.amount ELSE -le.amount END), 0) <> 0
    `;

    const negative = await this.prisma.$queryRaw<{ account_id: string }[]>`
      SELECT la.id AS account_id
      FROM ledger_accounts la
      LEFT JOIN ledger_entries le ON le."accountId" = la.id
      WHERE la.kind IN ('USER_AVAILABLE', 'USER_HELD')
      GROUP BY la.id
      HAVING COALESCE(SUM(CASE WHEN le.direction = 'CREDIT' THEN le.amount ELSE -le.amount END), 0) < 0
    `;

    const checkedTransactions = await this.prisma.ledgerTransaction.count();

    return {
      ok: unbalanced.length === 0 && negative.length === 0,
      checkedTransactions,
      unbalanced: unbalanced.map((r) => r.transaction_id),
      negativeBalances: negative.map((r) => r.account_id),
    };
  }
}
