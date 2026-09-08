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
import { ProviderUnavailableError } from '../../common/errors';
import { fromTokenRawValue } from '@tenzopay/shared';

/**
 * Alchemy adapter.
 *
 * Uses:
 *   - `eth_blockNumber` / `eth_getTransactionReceipt` (standard JSON-RPC)
 *   - `alchemy_getAssetTransfers` for historical ERC-20 transfers
 *   - the Notify (Webhooks) REST API to manage watched addresses
 *
 * Chain support note: Alchemy offers TRON RPC, but Address Activity webhooks
 * are documented for EVM chains and Solana. Since ~half of circulating USDT is
 * on TRON this is a real commercial limitation, recorded rather than papered
 * over. Only the two Ethereum networks below are wired up.
 */

const RPC_HOST: Record<SupportedNetwork, string> = {
  ETHEREUM_MAINNET: 'https://eth-mainnet.g.alchemy.com/v2',
  ETHEREUM_SEPOLIA: 'https://eth-sepolia.g.alchemy.com/v2',
};

const NOTIFY_BASE = 'https://dashboard.alchemy.com/api';

interface JsonRpcResponse<T> {
  jsonrpc: string;
  id: number;
  result?: T;
  error?: { code: number; message: string };
}

interface AssetTransfer {
  blockNum: string;
  hash: string;
  from: string;
  to: string;
  value: number | null;
  asset: string | null;
  category: string;
  uniqueId?: string;
  rawContract: { value: string; address: string; decimal: string };
  metadata?: { blockTimestamp?: string };
}

@Injectable()
export class AlchemyBlockchainProvider implements BlockchainProvider {
  readonly name = 'alchemy';
  readonly network: SupportedNetwork;

  private readonly logger = new Logger(AlchemyBlockchainProvider.name);
  private readonly config: AppConfig;
  private readonly rpcUrl: string;

  constructor(configService: ConfigService<{ app: AppConfig }, true>) {
    this.config = configService.get('app', { infer: true });
    this.network = this.config.deposits.network as SupportedNetwork;
    this.rpcUrl = `${RPC_HOST[this.network]}/${this.config.alchemy.apiKey}`;
  }

  // ----------------------------------------------------------- JSON-RPC ----

  private async rpc<T>(method: string, params: unknown[], retries = 3): Promise<T> {
    let lastError: unknown;

    for (let attempt = 0; attempt <= retries; attempt++) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 15_000);

      try {
        const response = await fetch(this.rpcUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
          signal: controller.signal,
        });

        // 429 is Alchemy's compute-unit throttle — back off rather than fail.
        if (response.status === 429 || response.status >= 500) {
          lastError = `HTTP ${response.status}`;
          if (attempt < retries) {
            await this.sleep(this.backoffMs(attempt));
            continue;
          }
          break;
        }

        const json = (await response.json()) as JsonRpcResponse<T>;
        if (json.error) {
          throw new ProviderUnavailableError('alchemy', json.error);
        }
        return json.result as T;
      } catch (err) {
        if (err instanceof ProviderUnavailableError) throw err;
        lastError = err;
        if (attempt < retries) {
          await this.sleep(this.backoffMs(attempt));
          continue;
        }
      } finally {
        clearTimeout(timer);
      }
    }

    throw new ProviderUnavailableError('alchemy', lastError);
  }

  async getBlockNumber(): Promise<bigint> {
    const hex = await this.rpc<string>('eth_blockNumber', []);
    return BigInt(hex);
  }

  async getConfirmations(txHash: string): Promise<number | null> {
    const receipt = await this.rpc<{ blockNumber: string } | null>(
      'eth_getTransactionReceipt',
      [txHash],
    );

    // Unknown to the node. After a prior sighting this signals a re-org.
    if (!receipt?.blockNumber) return null;

    const head = await this.getBlockNumber();
    const mined = BigInt(receipt.blockNumber);
    if (head < mined) return 0;

    return Number(head - mined) + 1;
  }

  // --------------------------------------------------------- Transfers ----

  async getTokenTransfers(query: TransferQuery): Promise<TransferPage> {
    const params: Record<string, unknown> = {
      fromBlock: query.fromBlock !== undefined ? `0x${query.fromBlock.toString(16)}` : '0x0',
      toBlock:
        query.toBlock === undefined || query.toBlock === 'latest'
          ? 'latest'
          : `0x${query.toBlock.toString(16)}`,
      toAddress: query.toAddress,
      contractAddresses: [query.contractAddress],
      category: ['erc20'],
      withMetadata: true,
      excludeZeroValue: true,
      maxCount: `0x${(query.maxCount ?? 100).toString(16)}`,
      order: 'asc',
    };

    if (query.pageKey) params.pageKey = query.pageKey;

    const result = await this.rpc<{ transfers: AssetTransfer[]; pageKey?: string }>(
      'alchemy_getAssetTransfers',
      [params],
    );

    return {
      transfers: (result.transfers ?? []).map((t) => this.mapTransfer(t)),
      pageKey: result.pageKey ?? null,
    };
  }

  /**
   * Map an Alchemy transfer to our internal shape.
   *
   * Two deliberate choices:
   *  - The RAW hex value is used, never `value` (a JS float that silently
   *    loses precision above 2^53 and would mis-credit large deposits).
   *  - Token decimals come from the transfer's own `rawContract.decimal`,
   *    falling back to configuration, so a token with unexpected decimals
   *    cannot be credited by a factor of 10^n too much.
   */
  private mapTransfer(t: AssetTransfer): TokenTransfer {
    const decimalsHex = t.rawContract?.decimal;
    const tokenDecimals = decimalsHex
      ? parseInt(decimalsHex, 16)
      : this.config.deposits.usdtDecimals;

    const rawValue = BigInt(t.rawContract?.value ?? '0x0');

    return {
      network: this.network,
      txHash: t.hash,
      // getAssetTransfers exposes ordering through uniqueId (`<hash>:log:<n>`).
      logIndex: this.parseLogIndex(t.uniqueId),
      blockNumber: BigInt(t.blockNum),
      fromAddress: t.from?.toLowerCase() ?? '',
      toAddress: t.to?.toLowerCase() ?? '',
      contractAddress: t.rawContract?.address?.toLowerCase() ?? '',
      rawValue: rawValue.toString(),
      amount: fromTokenRawValue(rawValue, tokenDecimals, 'USDT'),
      raw: t,
    };
  }

  private parseLogIndex(uniqueId?: string): number {
    if (!uniqueId) return 0;
    const match = /log:(\d+)/.exec(uniqueId);
    return match ? Number(match[1]) : 0;
  }

  // ------------------------------------------------------ Notify (API) ----

  /**
   * Add an address to the Address Activity webhook.
   *
   * Requires ALCHEMY_AUTH_TOKEN and an existing webhook id. When either is
   * absent we report `registered: false` rather than throwing — deposits still
   * get picked up by the reconciliation sweep, just with higher latency.
   */
  async watchAddress(address: string): Promise<{ registered: boolean; reason?: string }> {
    const { authToken } = this.config.alchemy;
    const webhookId = process.env.ALCHEMY_WEBHOOK_ID;

    if (!authToken || !webhookId) {
      return {
        registered: false,
        reason: 'ALCHEMY_AUTH_TOKEN or ALCHEMY_WEBHOOK_ID not configured',
      };
    }

    try {
      const response = await fetch(`${NOTIFY_BASE}/update-webhook-addresses`, {
        method: 'PATCH',
        headers: { 'X-Alchemy-Token': authToken, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          webhook_id: webhookId,
          addresses_to_add: [address],
          addresses_to_remove: [],
        }),
      });

      if (!response.ok) {
        return { registered: false, reason: `HTTP ${response.status}` };
      }
      return { registered: true };
    } catch (err) {
      this.logger.warn(`Failed to register address with Alchemy Notify`);
      return {
        registered: false,
        reason: err instanceof Error ? err.message : 'unknown',
      };
    }
  }

  async unwatchAddress(address: string): Promise<void> {
    const { authToken } = this.config.alchemy;
    const webhookId = process.env.ALCHEMY_WEBHOOK_ID;
    if (!authToken || !webhookId) return;

    await fetch(`${NOTIFY_BASE}/update-webhook-addresses`, {
      method: 'PATCH',
      headers: { 'X-Alchemy-Token': authToken, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        webhook_id: webhookId,
        addresses_to_add: [],
        addresses_to_remove: [address],
      }),
    }).catch(() => undefined);
  }

  async healthCheck(): Promise<{ ok: boolean; latencyMs: number; error?: string }> {
    const started = Date.now();
    try {
      await this.rpc<string>('eth_blockNumber', [], 0);
      return { ok: true, latencyMs: Date.now() - started };
    } catch (err) {
      return {
        ok: false,
        latencyMs: Date.now() - started,
        error: err instanceof Error ? err.message : 'unknown',
      };
    }
  }

  private backoffMs(attempt: number): number {
    const base = Math.min(300 * 2 ** attempt, 5000);
    return Math.floor(base / 2 + Math.random() * (base / 2));
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((r) => setTimeout(r, ms));
  }
}
