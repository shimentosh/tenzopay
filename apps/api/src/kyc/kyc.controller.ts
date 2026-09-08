import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { kycSubmitSchema, type KycSubmitInput } from '@tenzopay/shared';
import { KycService } from './kyc.service';
import { CurrentUser, JwtAuthGuard, type RequestUser } from '../auth/guards';
import { zodPipe } from '../common/zod-validation.pipe';

@Controller('kyc')
@UseGuards(JwtAuthGuard)
export class KycController {
  constructor(private readonly kyc: KycService) {}

  @Get('status')
  async status(@CurrentUser() user: RequestUser) {
    return this.kyc.getStatus(user.id);
  }

  @Post('submit')
  // KYC submissions hit the provider's stricter account-holder rate limits.
  @Throttle({ default: { limit: 3, ttl: 300_000 } })
  async submit(
    @CurrentUser() user: RequestUser,
    @Body(zodPipe(kycSubmitSchema)) body: KycSubmitInput,
  ) {
    return this.kyc.submit(user.id, body);
  }
}
