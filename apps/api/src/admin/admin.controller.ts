import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { AdminRole } from '@prisma/client';
import { z } from 'zod';
import { adminAdjustmentSchema, type AdminAdjustmentInput } from '@tenzopay/shared';
import { AdminService } from './admin.service';
import { SettingsService } from '../settings/settings.service';
import { BillingService } from '../billing/billing.service';
import { AdminGuard, CurrentAdmin, Roles, type RequestAdmin } from '../auth/guards';
import { zodPipe } from '../common/zod-validation.pipe';

/**
 * Admin API, consumed by the separate console app on :7317.
 *
 * Every mutating route requires an explicit reason. Read routes are open to all
 * signed-in staff; write routes are gated by @Roles plus a second in-service
 * role check, so a missing decorator cannot silently widen access.
 */
const reasonSchema = z.object({
  reason: z.string().min(10, 'Give a reason of at least 10 characters').max(500),
});

const settingSchema = reasonSchema.extend({
  key: z.string().min(1).max(80),
  value: z.string().min(1).max(40),
});

const planSchema = reasonSchema.extend({
  plan: z.enum(['STARTER', 'TEAM', 'BUSINESS']),
});

const userStatusSchema = reasonSchema.extend({
  status: z.enum(['FROZEN', 'ACTIVE']),
});

@Controller('admin')
@UseGuards(AdminGuard)
export class AdminController {
  constructor(
    private readonly admin: AdminService,
    private readonly settings: SettingsService,
    private readonly billing: BillingService,
  ) {}

  @Get('me')
  async me(@CurrentAdmin() admin: RequestAdmin) {
    return admin;
  }

  @Get('dashboard')
  async dashboard() {
    return this.admin.dashboard();
  }

  @Get('health')
  async health() {
    return this.admin.health();
  }

  /**
   * Fee revenue and the volume that drives provider cost.
   *
   * Read-only, but finance data all the same: gated to ADMIN and FINANCE
   * rather than every signed-in staff member.
   */
  // ------------------------------------------------------------ Settings ----

  /**
   * Operational settings, plus the *status* of every credential.
   *
   * Credentials themselves are never returned — only whether each is present
   * and a short fingerprint, which is enough to confirm a rotation took effect
   * without disclosing anything usable.
   */
  @Get('settings')
  @Roles(AdminRole.ADMIN, AdminRole.FINANCE)
  async listSettings() {
    const [settings, credentials] = await Promise.all([
      this.settings.all(),
      Promise.resolve(this.settings.credentialStatus()),
    ]);
    return { settings, credentials };
  }

  /**
   * Change one setting. Reason mandatory, same as a balance correction —
   * it lands in admin_actions and audit_logs with the previous value.
   */
  @Post('settings')
  @Roles(AdminRole.ADMIN, AdminRole.FINANCE)
  async updateSetting(
    @CurrentAdmin() admin: RequestAdmin,
    @Body(zodPipe(settingSchema)) body: { key: string; value: string; reason: string },
  ) {
    return this.settings.set({
      adminId: admin.id,
      adminRole: admin.role,
      key: body.key,
      value: body.value,
      reason: body.reason,
    });
  }

  @Get('revenue')
  @Roles(AdminRole.ADMIN, AdminRole.FINANCE)
  async revenue(@Query('days') days?: string) {
    return this.admin.revenue({ days: days ? Number(days) : undefined });
  }

  // --------------------------------------------------------------- Users ----

  @Get('users')
  async listUsers(
    @Query('search') search?: string,
    @Query('status') status?: string,
    @Query('limit') limit?: string,
    @Query('cursor') cursor?: string,
  ) {
    return this.admin.listUsers({
      search,
      status,
      limit: Number(limit) || 25,
      cursor,
    });
  }

  @Get('users/:id')
  async getUser(@Param('id') id: string) {
    return this.admin.getUser(id);
  }

  @Post('users/:id/status')
  @Roles(AdminRole.ADMIN, AdminRole.RISK)
  async setUserStatus(
    @CurrentAdmin() admin: RequestAdmin,
    @Param('id') id: string,
    @Body(zodPipe(userStatusSchema))
    body: { status: 'FROZEN' | 'ACTIVE'; reason: string },
  ) {
    return this.admin.setUserStatus(admin, id, body.status, body.reason);
  }

  // -------------------------------------------------------------- Ledger ----

  /**
   * Post a signed adjustment. There is deliberately no "set balance" endpoint —
   * see AdminService.adjustBalance.
   */
  /**
   * Move an account between plans.
   *
   * Takes effect from the next monthly pass: no proration and no immediate
   * charge, so a downgrade never needs a refund path.
   */
  @Post('users/:id/plan')
  @Roles(AdminRole.ADMIN, AdminRole.FINANCE)
  async setPlan(
    @CurrentAdmin() admin: RequestAdmin,
    @Param('id') id: string,
    @Body(zodPipe(planSchema)) body: { plan: 'STARTER' | 'TEAM' | 'BUSINESS'; reason: string },
  ) {
    return this.billing.setPlan({
      adminId: admin.id,
      userId: id,
      plan: body.plan,
      reason: body.reason,
    });
  }

  @Post('ledger/adjust')
  @Roles(AdminRole.FINANCE)
  async adjust(
    @CurrentAdmin() admin: RequestAdmin,
    @Body(zodPipe(adminAdjustmentSchema)) body: AdminAdjustmentInput,
  ) {
    return this.admin.adjustBalance(admin, body);
  }

  @Get('ledger')
  async ledger(
    @Query('userId') userId?: string,
    @Query('limit') limit?: string,
    @Query('cursor') cursor?: string,
  ) {
    return this.admin.listLedgerEntries({
      userId,
      limit: Number(limit) || 50,
      cursor,
    });
  }

  // ------------------------------------------------------------ Deposits ----

  @Get('deposits')
  async deposits(
    @Query('status') status?: string,
    @Query('limit') limit?: string,
    @Query('cursor') cursor?: string,
  ) {
    return this.admin.listDeposits({ status, limit: Number(limit) || 25, cursor });
  }

  @Post('deposits/:id/reconcile')
  @Roles(AdminRole.ADMIN, AdminRole.FINANCE)
  async reconcile(
    @CurrentAdmin() admin: RequestAdmin,
    @Param('id') id: string,
    @Body(zodPipe(reasonSchema)) body: { reason: string },
  ) {
    return this.admin.retryDepositReconciliation(admin, id, body.reason);
  }

  // --------------------------------------------------------------- Cards ----

  @Get('cards')
  async cards(
    @Query('status') status?: string,
    @Query('limit') limit?: string,
    @Query('cursor') cursor?: string,
  ) {
    return this.admin.listCards({ status, limit: Number(limit) || 25, cursor });
  }

  @Post('cards/:id/freeze')
  @Roles(AdminRole.ADMIN, AdminRole.RISK)
  async freezeCard(
    @CurrentAdmin() admin: RequestAdmin,
    @Param('id') id: string,
    @Body(zodPipe(reasonSchema)) body: { reason: string },
  ) {
    return this.admin.freezeCard(admin, id, body.reason);
  }

  // ------------------------------------------------------------ Webhooks ----

  @Get('webhooks')
  async webhooks(
    @Query('status') status?: string,
    @Query('provider') provider?: string,
    @Query('limit') limit?: string,
  ) {
    return this.admin.listWebhooks({ status, provider, limit: Number(limit) || 50 });
  }

  @Post('webhooks/:id/replay')
  @Roles(AdminRole.ADMIN)
  async replayWebhook(
    @CurrentAdmin() admin: RequestAdmin,
    @Param('id') id: string,
    @Body(zodPipe(reasonSchema)) body: { reason: string },
  ) {
    return this.admin.replayWebhook(admin, id, body.reason);
  }

  // --------------------------------------------------------------- Audit ----

  @Get('audit')
  async audit(
    @Query('entityId') entityId?: string,
    @Query('limit') limit?: string,
    @Query('cursor') cursor?: string,
  ) {
    return this.admin.listAuditLogs({ entityId, limit: Number(limit) || 50, cursor });
  }
}
