import { Module } from '@nestjs/common';
import { WebhooksController } from './webhooks.controller';
import { WebhooksService } from './webhooks.service';
import { AsaService } from './asa.service';
import { KycModule } from '../kyc/kyc.module';
import { DepositsModule } from '../deposits/deposits.module';

@Module({
  imports: [KycModule, DepositsModule],
  controllers: [WebhooksController],
  providers: [WebhooksService, AsaService],
  exports: [WebhooksService, AsaService],
})
export class WebhooksModule {}
