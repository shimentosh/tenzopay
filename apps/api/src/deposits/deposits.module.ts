import { Module } from '@nestjs/common';
import { DepositsService } from './deposits.service';
import { DepositAddressService } from './deposit-address.service';
import { DepositsController } from './deposits.controller';

@Module({
  controllers: [DepositsController],
  providers: [DepositsService, DepositAddressService],
  exports: [DepositsService, DepositAddressService],
})
export class DepositsModule {}
