import { Module } from '@nestjs/common';
import { JobsService } from './jobs.service';
import { DepositsModule } from '../deposits/deposits.module';
import { BillingModule } from '../billing/billing.module';
import { WebhooksModule } from '../webhooks/webhooks.module';

@Module({
  imports: [DepositsModule, BillingModule, WebhooksModule],
  providers: [JobsService],
})
export class JobsModule {}
