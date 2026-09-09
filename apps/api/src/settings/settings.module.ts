import { Global, Module } from '@nestjs/common';
import { SettingsService } from './settings.service';

/**
 * Global, because settings are read from two very different places: the admin
 * console writes them, and the ledger reads fee rates while posting money.
 * Making the ledger import an admin module to price a transaction would have
 * the dependency pointing the wrong way.
 */
@Global()
@Module({
  providers: [SettingsService],
  exports: [SettingsService],
})
export class SettingsModule {}
