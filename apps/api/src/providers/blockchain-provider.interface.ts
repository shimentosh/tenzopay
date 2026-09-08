/**
 * BlockchainProvider — the seam over Alchemy.
 *
 * Scope note: this interface is deliberately READ-ONLY. It observes the chain;
 * it never signs or moves funds. Sweeping deposits requires private keys, which
 * TenzoPay does not hold — that belongs to a custody provider and is listed as
 * a missing dependency in docs/ARCHITECTURE.md §0.
 */

export type SupportedNetwork = 'ETHEREUM_MAINNET' | 'ETHEREUM_SEPOLIA';

export interface TokenTransfer {
  network: SupportedNetwork;
  txHash: string;
  /** Index of the ERC-20 Transfer log within the transaction. */
  logIndex: number;
  blockNumber: bigint;
  blockHash?: string | null;
  fromAddress: string;
  toAddress: string;
  contractAddress: string;
  /** Raw on-chain value in the token's own decimals. */
  rawValue: string;
  /** Converted to TenzoPay minor units for the wallet currency. */
  amount: bigint;
  raw?: unknown;
}

export interface TransferQuery {
  toAddress: string;
  contractAddress: string;
  fromBlock?: bigint;
  toBlock?: bigint | 'latest';
  maxCount?: number;
  pageKey?: string;
}

export interface TransferPage {
  transfers: TokenTransfer[];
  pageKey?: string | null;
}

export interface BlockchainProvider {
  readonly name: string;
  readonly network: SupportedNetwork;

  /** Current head block, used to compute confirmation depth. */
  getBlockNumber(): Promise<bigint>;

  /** Historical ERC-20 transfers to an address — the reconciliation backstop. */
  getTokenTransfers(query: TransferQuery): Promise<TransferPage>;

  /**
   * Confirmations for a transaction. Returns null when the tx is unknown to the
   * node, which after a previous sighting indicates a re-org.
   */
  getConfirmations(txHash: string): Promise<number | null>;

  /** Register an address for live Address Activity webhooks. */
  watchAddress(address: string): Promise<{ registered: boolean; reason?: string }>;
  unwatchAddress(address: string): Promise<void>;

  healthCheck(): Promise<{ ok: boolean; latencyMs: number; error?: string }>;
}

export const BLOCKCHAIN_PROVIDER = Symbol('BLOCKCHAIN_PROVIDER');
