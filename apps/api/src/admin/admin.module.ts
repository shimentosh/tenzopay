import { Module } from '@nestjs/common';
import { AdminService } from './admin.service';
import { AdminController } from './admin.controller';
import { DepositsModule } from '../deposits/deposits.module';
import { WebhooksModule } from '../webhooks/webhooks.module';

@Module({
  imports: [DepositsModule, WebhooksModule],
  controllers: [AdminController],
  providers: [AdminService],
  exports: [AdminService],
})
export class AdminModule {}
