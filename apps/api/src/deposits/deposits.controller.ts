import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { simulateDepositSchema } from '@tenzopay/shared';
import { DepositsService } from './deposits.service';
import { DepositAddressService } from './deposit-address.service';
import {
  CurrentUser,
  JwtAuthGuard,
  RequireKyc,
  type RequestUser,
} from '../auth/guards';
import { zodPipe } from '../common/zod-validation.pipe';

@Controller('deposits')
@UseGuards(JwtAuthGuard)
export class DepositsController {
  constructor(
    private readonly deposits: DepositsService,
    private readonly addresses: DepositAddressService,
  ) {}

  /** Address, QR data, network warnings and confirmation policy. */
  @Get('address')
  @RequireKyc()
  async address(@CurrentUser() user: RequestUser) {
    return this.addresses.getDepositInfo(user.id);
  }

  @Get()
  async list(
    @CurrentUser() user: RequestUser,
    @Query('limit') limit?: string,
    @Query('cursor') cursor?: string,
  ) {
    const parsed = Math.min(Math.max(Number(limit) || 25, 1), 100);
    return this.deposits.listForUser(user.id, parsed, cursor);
  }

  /**
   * Demo-only. Rejected unless DEPOSIT_MODE=demo, which configuration forbids
   * in production.
   */
  @Post('simulate')
  @RequireKyc()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  async simulate(
    @CurrentUser() user: RequestUser,
    @Body(zodPipe(simulateDepositSchema)) body: { amount: string },
  ) {
    return this.deposits.simulateDeposit(user.id, body.amount);
  }
}
