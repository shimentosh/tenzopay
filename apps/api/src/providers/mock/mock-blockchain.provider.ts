import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AppConfig } from '../../config/configuration';
import {
  BlockchainProvider,
  SupportedNetwork,
  TokenTransfer,
  TransferPage,
  TransferQuery,
} from '../blockchain-provider.interface';

/**
 * In-memory BlockchainProvider for demo mode and tests.
 *
 * Simulates a chain that advances one block per second so confirmation logic is
 * exercised for real: a simulated deposit genuinely moves
 * DETECTED -> CONFIRMING -> CONFIRMED as blocks accrue.
 *
 * Everything it produces is marked `isDemo` at the Deposit level and the UI
 * badges it. Config forbids demo mode when APP_ENV=production.
 */
@Injectable()
export class MockBlockchainProvider implements BlockchainProvider {
  readonly name = 'mock';
  readonly network: SupportedNetwork;

  private readonly logger = new Logger(MockBlockchainProvider.name);
  private readonly startedAt = Date.now();
  private readonly baseBlock = 6_000_000n;
  private readonly transfers = new Map<string, TokenTransfer>();
  /** txHash -> block it was "mined" in. */
  private readonly minedAt = new Map<string, bigint>();

  constructor(configService: ConfigService<{ app: AppConfig }, true>) {
    this.network = configService.get('app', { infer: true }).deposits
      .network as SupportedNetwork;
  }

  /** One simulated block per second since boot. */
  async getBlockNumber(): Promise<bigint> {
    const elapsedSeconds = BigInt(Math.floor((Date.now() - this.startedAt) / 1000));
    return this.baseBlock + elapsedSeconds;
  }

  async getConfirmations(txHash: string): Promise<number | null> {
    const mined = this.minedAt.get(txHash);
    if (mined === undefined) return null;

    const head = await this.getBlockNumber();
    if (head < mined) return 0;
    return Number(head - mined) + 1;
  }

  async getTokenTransfers(query: TransferQuery): Promise<TransferPage> {
    const to = query.toAddress.toLowerCase();
    return {
      transfers: [...this.transfers.values()].filter((t) => t.toAddress === to),
      pageKey: null,
    };
  }

  async watchAddress(): Promise<{ registered: boolean; reason?: string }> {
    return { registered: true, reason: 'mock provider' };
  }

  async unwatchAddress(): Promise<void> {
    /* no-op */
  }

  async healthCheck(): Promise<{ ok: boolean; latencyMs: number }> {
    return { ok: true, latencyMs: 0 };
  }

  /**
   * Test/demo hook: fabricate an inbound transfer that the deposit pipeline
   * then processes through its normal confirmation path.
   */
  async simulateTransfer(params: {
    toAddress: string;
    amount: bigint;
    contractAddress: string;
    fromAddress?: string;
  }): Promise<TokenTransfer> {
    const head = await this.getBlockNumber();
    const txHash = `0x${this.randomHex(64)}`;

    const transfer: TokenTransfer = {
      network: this.network,
      txHash,
      logIndex: 0,
      blockNumber: head,
      fromAddress: (params.fromAddress ?? `0x${this.randomHex(40)}`).toLowerCase(),
      toAddress: params.toAddress.toLowerCase(),
      contractAddress: params.contractAddress.toLowerCase(),
      rawValue: params.amount.toString(),
      amount: params.amount,
      raw: { simulated: true },
    };

    this.transfers.set(`${txHash}:0`, transfer);
    this.minedAt.set(txHash, head);
    this.logger.log(`Simulated ${params.amount} USDT to ${params.toAddress}`);
    return transfer;
  }

  private randomHex(length: number): string {
    const chars = '0123456789abcdef';
    let out = '';
    for (let i = 0; i < length; i++) {
      out += chars[Math.floor(Math.random() * 16)];
    }
    return out;
  }
}
