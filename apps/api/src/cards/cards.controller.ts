import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import {
  cardStatusActionSchema,
  createCardSchema,
  updateCardLimitsSchema,
  type CreateCardInput,
  type UpdateCardLimitsInput,
} from '@tenzopay/shared';
import { CardsService } from './cards.service';
import {
  CurrentUser,
  JwtAuthGuard,
  RequireKyc,
  type RequestUser,
} from '../auth/guards';
import { zodPipe } from '../common/zod-validation.pipe';

@Controller('cards')
@UseGuards(JwtAuthGuard)
export class CardsController {
  constructor(private readonly cards: CardsService) {}

  @Get()
  async list(@CurrentUser() user: RequestUser) {
    return this.cards.listForUser(user.id);
  }

  @Get(':id')
  async get(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.cards.getForUser(user.id, id);
  }

  @Post()
  @RequireKyc()
  // Lithic sandbox allows ~2 card writes/sec; keep well inside it.
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  async create(
    @CurrentUser() user: RequestUser,
    @Body(zodPipe(createCardSchema)) body: CreateCardInput,
  ) {
    return this.cards.create(user.id, body);
  }

  @Patch(':id/status')
  @RequireKyc()
  async setStatus(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
    @Body(zodPipe(cardStatusActionSchema))
    body: { action: 'freeze' | 'unfreeze' | 'close' },
  ) {
    return this.cards.setStatus(user.id, id, body.action);
  }

  @Patch(':id/limits')
  @RequireKyc()
  async updateLimits(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
    @Body(zodPipe(updateCardLimitsSchema)) body: UpdateCardLimitsInput,
  ) {
    return this.cards.updateLimits(user.id, id, body);
  }

  /**
   * Returns an issuer-hosted iframe URL. The PAN and CVV are rendered by the
   * issuer directly to the browser and never pass through this API.
   */
  @Post(':id/reveal')
  @RequireKyc()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  async reveal(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.cards.createRevealSession(user.id, id);
  }
}
