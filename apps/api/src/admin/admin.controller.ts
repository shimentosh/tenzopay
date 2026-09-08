import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { AdminRole } from '@prisma/client';
import { z } from 'zod';
import { adminAdjustmentSchema, type AdminAdjustmentInput } from '@tenzopay/shared';
import { AdminService } from './admin.service';
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

const userStatusSchema = reasonSchema.extend({
  status: z.enum(['FROZEN', 'ACTIVE']),
});

@Controller('admin')
@UseGuards(AdminGuard)
export class AdminController {
  constructor(private readonly admin: AdminService) {}

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
