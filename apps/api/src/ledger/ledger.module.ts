import { Global, Module } from '@nestjs/common';
import { LedgerService } from './ledger.service';
import { FeesService } from './fees.service';

@Global()
@Module({
  providers: [LedgerService, FeesService],
  exports: [LedgerService, FeesService],
})
export class LedgerModule {}
