import { Injectable, Logger } from '@nestjs/common';
import { FeeType, type Prisma } from '@prisma/client';
import { SettingsService } from '../settings/settings.service';

type Db = Prisma.TransactionClient | { fee: { create: (args: unknown) => unknown } };

/**
 * Fee calculation.
 *
 * Three rules hold everywhere in this file, and they are the reason the maths
 * is written out longhand rather than reached for from a helper:
 *
 *  1. **Integers only.** A fee is derived from a BigInt amount with BigInt
 *     arithmetic. No float ever touches it.
 *  2. **Rounding favours the customer.** Basis-point maths truncates, so a fee
 *     of 1.9 units is charged as 1. Over millions of transactions this costs a
 *     rounding unit each time and is worth it: a fee that rounds *up* is the
 *     kind of thing that turns into a regulatory complaint.
 *  3. **A fee is never charged from a balance that has not reserved it.**
 *     Deposit fees come out of the incoming money. Transaction fees are
 *     reserved inside the authorization hold. Neither can overdraw.
 *
 * Rates live in settings so staff can change them without a deploy, but a rate
 * is read once at the moment of charging and then persisted with the record —
 * changing a rate never rewrites what a past transaction cost.
 */
@Injectable()
export class FeesService {
  private readonly logger = new Logger(FeesService.name);

  constructor(private readonly settings: SettingsService) {}

  /** Basis points of an amount, truncated. 100 bps = 1%. */
  private applyBps(amount: bigint, bps: bigint): bigint {
    if (bps <= 0n || amount <= 0n) return 0n;
    return (amount * bps) / 10_000n;
  }

  private clamp(fee: bigint, min: bigint, max: bigint): bigint {
    let result = fee;
    if (min > 0n && result < min) result = min;
    if (max > 0n && result > max) result = max;
    return result < 0n ? 0n : result;
  }

  /**
   * What to charge on a confirmed deposit.
   *
   * Capped at the deposit itself: a minimum fee larger than a small deposit
   * would otherwise credit a negative amount.
   */
  async depositFee(amount: bigint): Promise<bigint> {
    const rates = await this.settings.getMany([
      'fee.deposit.bps',
      'fee.deposit.flat',
      'fee.deposit.min',
      'fee.deposit.max',
    ]);

    const raw = this.applyBps(amount, rates['fee.deposit.bps']) + rates['fee.deposit.flat'];
    const fee = this.clamp(raw, rates['fee.deposit.min'], rates['fee.deposit.max']);
    return fee > amount ? amount : fee;
  }

  /**
   * What to reserve on a card authorization.
   *
   * `foreignCurrency` adds the FX margin — the single largest revenue line in
   * most card programmes, and the one cardholders expect, because the
   * alternative is a worse rate hidden in the conversion itself.
   */
  async transactionFee(amount: bigint, foreignCurrency: boolean): Promise<bigint> {
    const rates = await this.settings.getMany([
      'fee.transaction.bps',
      'fee.transaction.flat',
      'fee.fx.bps',
    ]);

    let fee = this.applyBps(amount, rates['fee.transaction.bps']) + rates['fee.transaction.flat'];
    if (foreignCurrency) fee += this.applyBps(amount, rates['fee.fx.bps']);
    return fee < 0n ? 0n : fee;
  }

  /** What to charge for issuing a card. Zero disables the charge entirely. */
  async cardIssuanceFee(): Promise<bigint> {
    return this.settings.get('fee.card_issuance');
  }

  /**
   * Record a charge against the posting that moved the money.
   *
   * The row is written inside the caller's transaction, so a fee can never
   * exist without its balanced posting, and the posting can never happen
   * without the fee being recorded. `ledgerTransactionId` is what the console
   * checks: a fee row without one means those two came apart.
   */
  async record(
    db: Db,
    params: {
      userId: string;
      type: FeeType;
      amount: bigint;
      ledgerTransactionId: string;
      description: string;
      currency?: string;
    },
  ): Promise<void> {
    if (params.amount <= 0n) return;

    await (db as Prisma.TransactionClient).fee.create({
      data: {
        userId: params.userId,
        type: params.type,
        amount: params.amount,
        currency: params.currency ?? 'USDT',
        ledgerTransactionId: params.ledgerTransactionId,
        description: params.description,
      },
    });

    this.logger.log(
      `Fee ${params.type} ${params.amount} recorded for user ${params.userId} ` +
        `(ledger tx ${params.ledgerTransactionId})`,
    );
  }
}
