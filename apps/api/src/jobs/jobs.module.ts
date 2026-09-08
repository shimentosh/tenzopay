import { Module } from '@nestjs/common';
import { JobsService } from './jobs.service';
import { DepositsModule } from '../deposits/deposits.module';
import { WebhooksModule } from '../webhooks/webhooks.module';

@Module({
  imports: [DepositsModule, WebhooksModule],
  providers: [JobsService],
})
export class JobsModule {}
