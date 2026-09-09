import { Module } from '@nestjs/common';
import { AdminService } from './admin.service';
import { SettingsService } from './settings.service';
import { AdminController } from './admin.controller';
import { DepositsModule } from '../deposits/deposits.module';
import { WebhooksModule } from '../webhooks/webhooks.module';

@Module({
  imports: [DepositsModule, WebhooksModule],
  controllers: [AdminController],
  providers: [AdminService, SettingsService],
  exports: [AdminService, SettingsService],
})
export class AdminModule {}
