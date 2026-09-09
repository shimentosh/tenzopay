import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import { DepositAddressStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { LedgerService } from '../ledger/ledger.service';
import { DepositsService } from '../deposits/deposits.service';
import { WebhooksService } from '../webhooks/webhooks.service';
import { BillingService } from '../billing/billing.service';
import type { AppConfig } from '../config/configuration';

/**
 * Background reconciliation.
 *
 * These jobs are the safety net that turns "a webhook was missed" from a lost
 * deposit into a slower deposit. They are all idempotent and can be run at any
 * time without side effects.
 *
 * Scaling note: this uses in-process scheduling, which is correct for a single
 * instance. Running several API replicas would execute each job N times — the
 * idempotency guarantees make that safe but wasteful, so a real deployment
 * should move these to a queue with leader election (BullMQ/Redis).
 */
@Injectable()
export class JobsService {
  private readonly logger = new Logger(JobsService.name);
  private readonly config: AppConfig;
  /** Prevents an overlapping run when one pass takes longer than the interval. */
  private readonly running = new Set<string>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly ledger: LedgerService,
    private readonly deposits: DepositsService,
    private readonly webhooks: WebhooksService,
    private readonly billing: BillingService,
    configService: ConfigService<{ app: AppConfig }, true>,
  ) {
    this.config = configService.get('app', { infer: true });
  }

  private async guard(name: string, fn: () => Promise<void>): Promise<void> {
    if (this.running.has(name)) {
      this.logger.debug(`Skipping ${name}: previous run still in progress`);
      return;
    }
    this.running.add(name);
    try {
      await fn();
    } catch (err) {
      this.logger.error(
        `Job ${name} failed: ${err instanceof Error ? err.message : 'unknown'}`,
      );
    } finally {
      this.running.delete(name);
    }
  }

  /** Advance confirmations and credit anything that has matured. */
  @Cron(CronExpression.EVERY_30_SECONDS)
  async advanceDepositConfirmations(): Promise<void> {
    await this.guard('confirmations', async () => {
      const result = await this.deposits.advanceAllPending();
      if (result.credited > 0) {
        this.logger.log(
          `Confirmation pass: ${result.checked} checked, ${result.credited} credited`,
        );
      }
    });
  }

  /**
   * Re-read transfers straight from the chain for every active address.
   *
   * This is the backstop for a webhook that never arrived or failed
   * verification. Deduplication happens in recordTransfer.
   */
  @Cron(CronExpression.EVERY_5_MINUTES)
  async reconcileDeposits(): Promise<void> {
    if (this.config.deposits.mode === 'demo') return; // nothing on-chain to sweep

    await this.guard('deposit-reconcile', async () => {
      const addresses = await this.prisma.depositAddress.findMany({
        where: { status: DepositAddressStatus.ACTIVE, isDemo: false },
        select: { id: true },
        take: 500,
      });

      let recorded = 0;
      for (const address of addresses) {
        try {
          const result = await this.deposits.reconcileAddress(address.id);
          recorded += result.recorded;
        } catch {
          // One bad address must not stop the sweep.
        }
      }

      if (recorded > 0) {
        this.logger.warn(
          `Reconciliation recovered ${recorded} deposit(s) that webhooks missed`,
        );
      }
    });
  }

  /**
   * Release holds whose closing webhook never arrived.
   *
   * Runs hourly and looks back eight days — comfortably past any authorization
   * lifetime, so anything still pending has genuinely been abandoned rather
   * than being slow. Rare by design: if this releases anything, a webhook was
   * lost and that is worth investigating, which is why it logs at error.
   */
  @Cron(CronExpression.EVERY_HOUR)
  async sweepStaleAuthorizations(): Promise<void> {
    await this.guard('stale-authorizations', async () => {
      const result = await this.webhooks.sweepStaleAuthorizations();
      if (result.released > 0 || result.resolved > 0) {
        this.logger.warn(
          `Stale authorization sweep: ${result.checked} checked, ${result.resolved} resolved ` +
            `from the provider, ${result.released} released, ${result.unresolved} left alone`,
        );
      }
    });
  }

  /**
   * Watch credited deposits for a re-org.
   *
   * Confirmation tracking stops at CONFIRMED, so without this a transaction
   * that leaves the chain after crediting would keep its balance. Every ten
   * minutes over a 24-hour window is far deeper than the twelve-confirmation
   * threshold that credited it.
   */
  @Cron(CronExpression.EVERY_10_MINUTES)
  async watchDepositReorgs(): Promise<void> {
    if (this.config.deposits.mode === 'demo') return;

    await this.guard('deposit-reorg-watch', async () => {
      const result = await this.deposits.watchCreditedForReorg();
      if (result.reversed > 0) {
        this.logger.error(
          `Re-org watch reversed ${result.reversed} credited deposit(s) of ${result.checked} checked`,
        );
      }
    });
  }

  /**
   * Charge monthly plans.
   *
   * Daily rather than monthly: an account that could not pay on the first gets
   * another attempt tomorrow, and a plan started mid-month is picked up on the
   * next pass. The idempotency key is what prevents a second charge, not the
   * schedule, so running this more often is harmless.
   */
  @Cron(CronExpression.EVERY_DAY_AT_2AM)
  async chargeMonthlyPlans(): Promise<void> {
    await this.guard('monthly-plans', async () => {
      const result = await this.billing.chargeDuePlans();
      if (result.charged > 0 || result.downgraded > 0 || result.retried > 0) {
        this.logger.log(
          `Plan billing: ${result.charged} charged, ${result.retried} awaiting funds, ` +
            `${result.downgraded} downgraded, of ${result.considered} considered`,
        );
      }
    });
  }

  /** Retry transient webhook processing failures. */
  @Cron(CronExpression.EVERY_MINUTE)
  async retryWebhooks(): Promise<void> {
    await this.guard('webhook-retry', async () => {
      const result = await this.webhooks.retryFailed(20);
      if (result.retried > 0) {
        this.logger.log(`Retried ${result.retried} failed webhook(s)`);
      }
    });
  }

  /**
   * Ledger invariant check.
   *
   * Asserts that every transaction still nets to zero and no customer balance
   * has gone negative. If this ever fires, something is seriously wrong and it
   * needs a human — hence the error-level log and the admin dashboard alert.
   */
  @Cron(CronExpression.EVERY_10_MINUTES)
  async verifyLedgerIntegrity(): Promise<void> {
    await this.guard('ledger-integrity', async () => {
      const result = await this.ledger.verifyIntegrity();

      if (!result.ok) {
        this.logger.error(
          `LEDGER INTEGRITY FAILURE — unbalanced: ${result.unbalanced.length}, ` +
            `negative balances: ${result.negativeBalances.length}. ` +
            `Transactions: ${result.unbalanced.slice(0, 5).join(', ')}`,
        );
      } else {
        this.logger.debug(
          `Ledger integrity OK across ${result.checkedTransactions} transactions`,
        );
      }
    });
  }

  /** Housekeeping: drop expired and long-revoked sessions. */
  @Cron(CronExpression.EVERY_HOUR)
  async pruneSessions(): Promise<void> {
    await this.guard('prune-sessions', async () => {
      const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      const result = await this.prisma.session.deleteMany({
        where: {
          OR: [{ expiresAt: { lt: new Date() } }, { revokedAt: { lt: cutoff } }],
        },
      });
      if (result.count > 0) {
        this.logger.debug(`Pruned ${result.count} expired session(s)`);
      }
    });
  }
}
