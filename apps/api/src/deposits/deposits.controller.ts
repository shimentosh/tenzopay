import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { DepositsService } from './deposits.service';
import { DepositAddressService } from './deposit-address.service';
import {
  CurrentUser,
  JwtAuthGuard,
  RequireKyc,
  type RequestUser,
} from '../auth/guards';

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
}
