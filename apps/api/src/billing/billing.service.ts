import { Injectable, Logger } from '@nestjs/common';
import { FeeType, NotificationType, UserPlan, UserStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { LedgerService } from '../ledger/ledger.service';
import { SettingsService } from '../settings/settings.service';
import { InsufficientBalanceError } from '../common/errors';

/**
 * Monthly plan billing.
 *
 * Three decisions shape this file, and none of them are technical:
 *
 *  1. **A plan is charged once per calendar month**, on the first attempt of
 *     that month, keyed `fee:monthly:<userId>:<YYYY-MM>`. Not on a per-account
 *     anniversary, which would mean tracking a cycle per user for no benefit a
 *     customer would notice. There is no proration: a plan change takes effect
 *     from the next month, so nobody is ever charged twice for one month.
 *
 *  2. **A charge the balance cannot cover does not create a debt.** It is
 *     retried daily for `billing.dunning_days`, and if it still cannot be paid
 *     the account drops to Starter. The alternative — letting the balance go
 *     negative — is right for a chargeback, where the money genuinely left, and
 *     wrong for a subscription, where it never arrived.
 *
 *  3. **Business is not billed here** while its price is zero. That plan is
 *     priced case by case, and inventing a number for it would be worse than
 *     charging nothing.
 *
 * The job is idempotent and safe to run as often as you like: the ledger's
 * unique idempotency key is what actually prevents a second charge, not the
 * schedule.
 */
@Injectable()
export class BillingService {
  private readonly logger = new Logger(BillingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly ledger: LedgerService,
    private readonly settings: SettingsService,
  ) {}

  /** `2026-09`. The billing period a moment belongs to. */
  private period(now = new Date()): string {
    return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
  }

  private async priceFor(plan: UserPlan): Promise<bigint> {
    if (plan === UserPlan.TEAM) return this.settings.get('fee.plan.team');
    if (plan === UserPlan.BUSINESS) return this.settings.get('fee.plan.business');
    return 0n;
  }

  /**
   * Charge every account that owes for the current month.
   *
   * Runs daily rather than monthly on purpose: an account that could not pay on
   * the first gets another attempt tomorrow, and a plan started mid-month is
   * picked up on the next pass rather than waiting for the next cycle.
   */
  async chargeDuePlans(now = new Date()): Promise<{
    considered: number;
    charged: number;
    retried: number;
    downgraded: number;
  }> {
    const period = this.period(now);
    const dunningDays = Number(await this.settings.get('billing.dunning_days'));

    const accounts = await this.prisma.user.findMany({
      where: {
        plan: { not: UserPlan.STARTER },
        status: { not: UserStatus.CLOSED },
      },
      select: { id: true, plan: true, planDunningSince: true },
      take: 500,
    });

    let charged = 0;
    let retried = 0;
    let downgraded = 0;

    for (const account of accounts) {
      const price = await this.priceFor(account.plan);
      if (price <= 0n) continue; // priced elsewhere, or free

      const idempotencyKey = `fee:monthly:${account.id}:${period}`;

      // Already paid this month. The ledger would refuse a second charge
      // anyway; checking first keeps the log quiet.
      const existing = await this.prisma.ledgerTransaction.findUnique({
        where: { idempotencyKey },
        select: { id: true },
      });
      if (existing) continue;

      try {
        await this.ledger.chargeFee({
          userId: account.id,
          idempotencyKey,
          amount: price,
          feeType: FeeType.MONTHLY,
          description: `${account.plan} plan — ${period}`,
        });

        charged += 1;

        if (account.planDunningSince) {
          await this.prisma.user.update({
            where: { id: account.id },
            data: { planDunningSince: null },
          });
        }

        await this.notify(
          account.id,
          'Plan fee charged',
          `Your ${account.plan.toLowerCase()} plan for ${period} has been paid from your balance.`,
        );
      } catch (err) {
        if (!(err instanceof InsufficientBalanceError)) throw err;

        const since = account.planDunningSince ?? now;
        const daysFailing = Math.floor((now.getTime() - since.getTime()) / 86_400_000);

        if (daysFailing >= dunningDays) {
          // Out of road. Drop the plan rather than let a debt accumulate.
          await this.prisma.user.update({
            where: { id: account.id },
            data: { plan: UserPlan.STARTER, planDunningSince: null },
          });

          await this.prisma.auditLog.create({
            data: {
              actorType: 'SYSTEM',
              action: 'plan.downgraded',
              entityType: 'user',
              entityId: account.id,
              before: { plan: account.plan },
              after: { plan: UserPlan.STARTER },
              reason: `Plan fee unpaid for ${daysFailing} days`,
            },
          });

          downgraded += 1;
          await this.notify(
            account.id,
            'Your plan has been changed to Starter',
            'We could not collect the plan fee from your balance. Add money and ' +
              'switch back whenever you are ready — nothing else has changed.',
          );

          this.logger.warn(
            `Downgraded user ${account.id} from ${account.plan} after ${daysFailing} days unpaid`,
          );
          continue;
        }

        if (!account.planDunningSince) {
          await this.prisma.user.update({
            where: { id: account.id },
            data: { planDunningSince: now },
          });

          await this.notify(
            account.id,
            'We could not collect your plan fee',
            `Your balance does not cover the ${period} plan fee. We will try again ` +
              `daily for ${dunningDays} days.`,
          );
        }

        retried += 1;
      }
    }

    return { considered: accounts.length, charged, retried, downgraded };
  }

  /**
   * Move an account to a different plan.
   *
   * No proration and no immediate charge: the new plan is billed from the next
   * monthly pass. Charging on the spot would mean refunding on a downgrade,
   * and a refund path for a subscription is a whole product decision of its own.
   */
  async setPlan(params: {
    adminId: string;
    userId: string;
    plan: UserPlan;
    reason: string;
  }): Promise<{ userId: string; plan: UserPlan }> {
    const user = await this.prisma.user.findUnique({
      where: { id: params.userId },
      select: { plan: true },
    });
    if (!user) throw new Error('User not found');

    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: params.userId },
        data: { plan: params.plan, planDunningSince: null },
      });

      await tx.adminAction.create({
        data: {
          adminUserId: params.adminId,
          type: 'PLAN_CHANGED',
          targetType: 'user',
          targetId: params.userId,
          reason: params.reason,
          metadata: { before: user.plan, after: params.plan },
        },
      });

      await tx.auditLog.create({
        data: {
          adminUserId: params.adminId,
          actorType: 'ADMIN',
          actorId: params.adminId,
          action: 'plan.changed',
          entityType: 'user',
          entityId: params.userId,
          before: { plan: user.plan },
          after: { plan: params.plan },
          reason: params.reason,
        },
      });
    });

    this.logger.log(`User ${params.userId}: plan ${user.plan} -> ${params.plan}`);
    return { userId: params.userId, plan: params.plan };
  }

  private async notify(userId: string, title: string, body: string): Promise<void> {
    await this.prisma.notification
      .create({ data: { userId, type: NotificationType.SECURITY, title, body } })
      .catch(() => undefined); // A notification must never fail a charge.
  }
}
