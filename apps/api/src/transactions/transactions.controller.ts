import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { transactionQuerySchema, type TransactionQuery } from '@tenzopay/shared';
import { TransactionsService } from './transactions.service';
import { CurrentUser, JwtAuthGuard, type RequestUser } from '../auth/guards';
import { zodPipe } from '../common/zod-validation.pipe';
import { NotFoundError } from '../common/errors';

@Controller()
@UseGuards(JwtAuthGuard)
export class TransactionsController {
  constructor(private readonly transactions: TransactionsService) {}

  /** Balance + headline counters for the dashboard. */
  @Get('overview')
  async overview(@CurrentUser() user: RequestUser) {
    return this.transactions.overview(user.id);
  }

  @Get('transactions')
  async list(
    @CurrentUser() user: RequestUser,
    @Query(zodPipe(transactionQuerySchema)) query: TransactionQuery,
  ) {
    return this.transactions.list(user.id, query);
  }

  @Get('transactions/spending')
  async spending(
    @CurrentUser() user: RequestUser,
    @Query('days') days?: string,
  ) {
    const parsed = Number(days);
    const window = parsed === 1 || parsed === 7 || parsed === 30 ? parsed : 30;
    return this.transactions.spendingOverview(user.id, window as 1 | 7 | 30);
  }

  @Get('transactions/:id')
  async get(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    const transaction = await this.transactions.getCardTransaction(user.id, id);
    if (!transaction) throw new NotFoundError('Transaction');
    return transaction;
  }
}
