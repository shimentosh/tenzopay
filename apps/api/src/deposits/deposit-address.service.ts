import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BlockchainNetwork } from '@prisma/client';
import { HDKey } from 'viem/accounts';
import { keccak256, toHex } from 'viem';
import { PrismaService } from '../prisma/prisma.service';
import type { AppConfig } from '../config/configuration';
import {
  BLOCKCHAIN_PROVIDER,
  type BlockchainProvider,
} from '../providers/blockchain-provider.interface';
import { AppError } from '../common/errors';

/**
 * Deposit address assignment.
 *
 * Architecture (see docs/ARCHITECTURE.md §13): each user gets ONE deterministic
 * address per network, derived from a watch-only BIP-32 account xpub at
 *   m/44'/60'/0'/0/{index}
 *
 * TenzoPay holds the extended PUBLIC key only. No private key, seed phrase, or
 * signing capability exists anywhere in this codebase or database. That is why
 * deposits can be *observed* but not *swept* — sweeping needs a custody
 * provider (Fireblocks / Turnkey / BitGo), which is an unmet dependency.
 *
 * In demo mode a clearly-marked pseudo-address is generated instead, and the
 * Deposit rows it produces carry `isDemo: true` so the UI can badge them.
 */
@Injectable()
export class DepositAddressService {
  private readonly logger = new Logger(DepositAddressService.name);
  private readonly config: AppConfig;

  constructor(
    private readonly prisma: PrismaService,
    @Inject(BLOCKCHAIN_PROVIDER) private readonly chain: BlockchainProvider,
    configService: ConfigService<{ app: AppConfig }, true>,
  ) {
    this.config = configService.get('app', { infer: true });
  }

  /**
   * Return the user's address for the active network, creating it on first use.
   * Idempotent — the unique constraint on (walletId, network) makes a race
   * resolve to the same row.
   */
  async getOrCreate(userId: string) {
    const network = this.config.deposits.network as BlockchainNetwork;

    const wallet = await this.prisma.wallet.upsert({
      where: { userId },
      create: { userId },
      update: {},
      select: { id: true },
    });

    const existing = await this.prisma.depositAddress.findUnique({
      where: { walletId_network: { walletId: wallet.id, network } },
    });
    if (existing) return existing;

    /**
     * Allocate the next derivation index as MAX + 1, never COUNT.
     *
     * COUNT reuses an index the moment any row for this network is removed,
     * which would hand a second user an address a previous user may still be
     * sending to — their funds would credit the wrong account. MAX only ever
     * moves forward, so an index is never issued twice even after a delete.
     *
     * The unique constraint on (network, derivationIndex) remains the backstop
     * for the concurrent case: the loser of a race fails the insert rather
     * than silently sharing an address.
     */
    const highest = await this.prisma.depositAddress.aggregate({
      where: { network },
      _max: { derivationIndex: true },
    });
    const index = (highest._max.derivationIndex ?? -1) + 1;
    const { address, isDemo } = this.deriveAddress(index);

    try {
      const created = await this.prisma.depositAddress.create({
        data: {
          walletId: wallet.id,
          network,
          address: address.toLowerCase(),
          derivationIndex: index,
          isDemo,
        },
      });

      // Register for live webhooks. A failure here is non-fatal: the
      // reconciliation sweep still finds the deposit, just more slowly.
      const watch = await this.chain.watchAddress(created.address);
      if (watch.registered) {
        await this.prisma.depositAddress.update({
          where: { id: created.id },
          data: { registeredWithProvider: true },
        });
      } else {
        this.logger.warn(
          `Address ${created.address} not registered for webhooks: ${watch.reason}. ` +
            'Falling back to the reconciliation sweep.',
        );
      }

      return created;
    } catch (err) {
      // Lost a race — return the winner's row.
      const raced = await this.prisma.depositAddress.findUnique({
        where: { walletId_network: { walletId: wallet.id, network } },
      });
      if (raced) return raced;
      throw err;
    }
  }

  /**
   * Derive the address for a BIP-44 index.
   *
   * With a real xpub this is a standard non-hardened child derivation. Without
   * one (demo mode) it produces a deterministic pseudo-address that is clearly
   * not a funded account — and config forbids demo mode in production.
   */
  private deriveAddress(index: number): { address: string; isDemo: boolean } {
    const { xpub, mode } = this.config.deposits;

    if (mode === 'production' && !xpub) {
      // Belt and braces — configuration validation already rejects this.
      throw new AppError(
        'CUSTODY_NOT_CONFIGURED',
        'Deposits are temporarily unavailable.',
        503,
        'DEPOSIT_MODE=production requires a custody provider and DEPOSIT_XPUB',
      );
    }

    if (xpub) {
      const node = HDKey.fromExtendedKey(xpub);
      const child = node.deriveChild(0).deriveChild(index);
      if (!child.publicKey) {
        throw new AppError('DERIVATION_FAILED', 'Could not allocate a deposit address.', 500);
      }
      // EVM address = last 20 bytes of keccak256 of the uncompressed pubkey
      // without its 0x04 prefix.
      const uncompressed = child.publicKey.length === 65
        ? child.publicKey.slice(1)
        : child.publicKey;
      const hash = keccak256(toHex(uncompressed));
      return { address: `0x${hash.slice(-40)}`, isDemo: false };
    }

    // Demo: deterministic, derived from a fixed label so it is stable per index
    // and obviously synthetic.
    const digest = keccak256(toHex(`tenzopay-demo-address-${index}`));
    return { address: `0x${digest.slice(-40)}`, isDemo: true };
  }

  /** Everything the deposit screen needs to render safely. */
  async getDepositInfo(userId: string) {
    const address = await this.getOrCreate(userId);
    const { network, usdtContract, confirmations, minAmount, mode } = this.config.deposits;

    return {
      address: address.address,
      network,
      networkLabel:
        network === BlockchainNetwork.ETHEREUM_MAINNET
          ? 'Ethereum (ERC-20)'
          : 'Ethereum Sepolia (testnet)',
      currency: 'USDT',
      contractAddress: usdtContract || null,
      requiredConfirmations: confirmations,
      minimumAmount: minAmount.toString(),
      mode,
      isDemo: address.isDemo,
      // Surfaced so the UI can warn instead of silently losing funds.
      warnings: this.buildWarnings(address.isDemo),
    };
  }

  private buildWarnings(isDemo: boolean): string[] {
    const warnings: string[] = [];

    if (isDemo) {
      warnings.push(
        'This is a simulated address for demonstration. It cannot receive real funds. ' +
          'Anything sent to it will be lost.',
      );
    }

    warnings.push(
      'Send only USDT on the network shown above. Tokens sent on another ' +
        'network, or a different token, cannot be recovered.',
    );

    if (this.config.deposits.network === BlockchainNetwork.ETHEREUM_SEPOLIA) {
      warnings.push('This is a testnet address. Testnet tokens have no monetary value.');
    }

    return warnings;
  }
}
