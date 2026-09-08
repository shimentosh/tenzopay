import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AppConfig } from '../config/configuration';
import { LithicClient } from './lithic/lithic.client';
import { LithicCardProvider } from './lithic/lithic-card.provider';
import { MockCardProvider } from './mock/mock-card.provider';
import { AlchemyBlockchainProvider } from './alchemy/alchemy.provider';
import { MockBlockchainProvider } from './mock/mock-blockchain.provider';
import { CARD_PROVIDER } from './card-provider.interface';
import { BLOCKCHAIN_PROVIDER } from './blockchain-provider.interface';

/**
 * Provider wiring.
 *
 * Swapping Lithic for another issuer, or Alchemy for another indexer, is a
 * change to the two factories below and nothing else — no service or controller
 * imports a vendor class directly.
 */
@Global()
@Module({
  providers: [
    LithicClient,
    LithicCardProvider,
    MockCardProvider,
    AlchemyBlockchainProvider,
    MockBlockchainProvider,
    {
      provide: CARD_PROVIDER,
      inject: [ConfigService, LithicCardProvider, MockCardProvider],
      useFactory: (
        configService: ConfigService<{ app: AppConfig }, true>,
        lithic: LithicCardProvider,
        mock: MockCardProvider,
      ) => (configService.get('app', { infer: true }).lithic.enabled ? lithic : mock),
    },
    {
      provide: BLOCKCHAIN_PROVIDER,
      inject: [ConfigService, AlchemyBlockchainProvider, MockBlockchainProvider],
      useFactory: (
        configService: ConfigService<{ app: AppConfig }, true>,
        alchemy: AlchemyBlockchainProvider,
        mock: MockBlockchainProvider,
      ) => (configService.get('app', { infer: true }).alchemy.enabled ? alchemy : mock),
    },
  ],
  exports: [
    CARD_PROVIDER,
    BLOCKCHAIN_PROVIDER,
    LithicClient,
    MockCardProvider,
    MockBlockchainProvider,
  ],
})
export class ProvidersModule {}
