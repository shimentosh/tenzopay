import { Global, Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AuthService } from './auth.service';
import { AdminAuthService } from './admin-auth.service';
import { AuthController } from './auth.controller';
import { AdminGuard, JwtAuthGuard } from './guards';
import { LedgerModule } from '../ledger/ledger.module';

@Global()
@Module({
  imports: [JwtModule.register({}), LedgerModule],
  controllers: [AuthController],
  providers: [AuthService, AdminAuthService, JwtAuthGuard, AdminGuard],
  exports: [AuthService, AdminAuthService, JwtAuthGuard, AdminGuard, JwtModule],
})
export class AuthModule {}
