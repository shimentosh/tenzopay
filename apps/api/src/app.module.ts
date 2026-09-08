import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { buildConfig } from './config/configuration';
import { PrismaModule } from './prisma/prisma.module';
import { LedgerModule } from './ledger/ledger.module';
import { ProvidersModule } from './providers/providers.module';
import { AuthModule } from './auth/auth.module';
import { KycModule } from './kyc/kyc.module';
import { DepositsModule } from './deposits/deposits.module';
import { CardsModule } from './cards/cards.module';
import { TransactionsModule } from './transactions/transactions.module';
import { WebhooksModule } from './webhooks/webhooks.module';
import { AdminModule } from './admin/admin.module';
import { NotificationsModule } from './notifications/notifications.module';
import { JobsModule } from './jobs/jobs.module';
import { HealthController } from './health.controller';
import { LoggingMiddleware } from './common/logging.middleware';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      // Validated once at boot. An invalid combination stops the process
      // rather than surfacing during a payment.
      load: [() => ({ app: buildConfig() })],
    }),
    ThrottlerModule.forRoot({
      throttlers: [{ name: 'default', ttl: 60_000, limit: 120 }],
      /**
       * Rate limiting is deliberately tight (5 registrations/minute), which
       * would fail an exhaustive test suite for the right reason. It can be
       * skipped ONLY under NODE_ENV=test, so setting the flag in a real
       * deployment does nothing. throttling.spec.ts covers the live guard.
       */
      skipIf: () =>
        process.env.NODE_ENV === 'test' &&
        process.env.DISABLE_RATE_LIMIT === 'true',
    }),
    ScheduleModule.forRoot(),

    PrismaModule,
    LedgerModule,
    ProvidersModule,
    AuthModule,
    KycModule,
    DepositsModule,
    CardsModule,
    TransactionsModule,
    WebhooksModule,
    AdminModule,
    NotificationsModule,
    JobsModule,
  ],
  controllers: [HealthController],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(LoggingMiddleware).forRoutes('*');
  }
}
