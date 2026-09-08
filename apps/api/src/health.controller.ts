import { Controller, Get } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SkipThrottle } from '@nestjs/throttler';
import { PrismaService } from './prisma/prisma.service';
import { Public } from './auth/guards';
import type { AppConfig } from './config/configuration';

@Controller()
export class HealthController {
  private readonly config: AppConfig;

  constructor(
    private readonly prisma: PrismaService,
    configService: ConfigService<{ app: AppConfig }, true>,
  ) {
    this.config = configService.get('app', { infer: true });
  }

  /** Liveness/readiness. Deliberately exposes no configuration detail. */
  @Public()
  @SkipThrottle()
  @Get('health')
  async health() {
    const database = await this.prisma.healthCheck();
    return {
      status: database.ok ? 'ok' : 'degraded',
      uptime: Math.floor(process.uptime()),
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Non-secret runtime mode, used by both front-ends to render the environment
   * banner and to decide whether the demo-deposit control is shown.
   */
  @Public()
  @Get('config')
  async publicConfig() {
    return {
      appEnv: this.config.appEnv,
      depositMode: this.config.deposits.mode,
      depositNetwork: this.config.deposits.network,
      cardProvider: this.config.lithic.enabled ? 'lithic' : 'mock',
      blockchainProvider: this.config.alchemy.enabled ? 'alchemy' : 'mock',
      requiredConfirmations: this.config.deposits.confirmations,
      currency: 'USDT',
    };
  }
}
