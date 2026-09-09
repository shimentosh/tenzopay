import { Injectable, Logger } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { AdminActionType, type AdminRole } from '@prisma/client';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import type { AppConfig } from '../config/configuration';
import { ValidationError } from '../common/errors';

/**
 * Operational settings.
 *
 * The split here is the whole point, so it is worth stating plainly:
 *
 *   - **Secrets and wallet material stay in the environment.** They are
 *     validated at boot and are never writable through the API. A stolen
 *     admin session must not be able to point deposits at another address.
 *     This service exposes only their *status* — configured or not, plus a
 *     fingerprint that identifies which key is loaded without revealing it.
 *
 *   - **Prices and thresholds live in the database.** They are safe to change
 *     at runtime, and every change goes through `set()`, which demands a
 *     reason and writes an admin action and an audit log.
 *
 * Values are stored as strings and parsed against the registry below, so a new
 * setting is a code change and never a migration.
 */

export type SettingType = 'minor' | 'integer' | 'bps';

export interface SettingDefinition {
  key: string;
  label: string;
  description: string;
  type: SettingType;
  group: 'cost' | 'fee' | 'limits';
  default: string;
  /** Roles allowed to change it. */
  roles: AdminRole[];
}

/**
 * `minor` values are USDT minor units (6dp), consistent with every other
 * amount in the system. `bps` is basis points — 100 bps = 1%.
 */
export const SETTINGS: SettingDefinition[] = [
  // ---- What providers charge us. Nothing else in the system knows this. ----
  {
    key: 'cost.card_issuance',
    label: 'Cost per card issued',
    description: 'What the card issuer bills for creating one virtual card.',
    type: 'minor',
    group: 'cost',
    default: '0',
    roles: ['ADMIN', 'FINANCE'] as AdminRole[],
  },
  {
    key: 'cost.card_monthly',
    label: 'Cost per active card, monthly',
    description: 'Recurring issuer charge for keeping a card open.',
    type: 'minor',
    group: 'cost',
    default: '0',
    roles: ['ADMIN', 'FINANCE'] as AdminRole[],
  },
  {
    key: 'cost.transaction',
    label: 'Cost per settled transaction',
    description: 'Per-authorization charge from the issuer.',
    type: 'minor',
    group: 'cost',
    default: '0',
    roles: ['ADMIN', 'FINANCE'] as AdminRole[],
  },
  {
    key: 'cost.deposit',
    label: 'Cost per confirmed deposit',
    description: 'Node or RPC cost attributable to detecting and confirming one deposit.',
    type: 'minor',
    group: 'cost',
    default: '0',
    roles: ['ADMIN', 'FINANCE'] as AdminRole[],
  },
  {
    key: 'cost.fixed_monthly',
    label: 'Fixed monthly cost',
    description: 'Subscriptions and infrastructure that do not scale with volume.',
    type: 'minor',
    group: 'cost',
    default: '0',
    roles: ['ADMIN', 'FINANCE'] as AdminRole[],
  },

  // ---- What we intend to charge. Not yet applied by any code path. ----
  {
    key: 'fee.deposit.bps',
    label: 'Deposit fee',
    description: 'Basis points taken from a confirmed deposit. 100 bps = 1%.',
    type: 'bps',
    group: 'fee',
    default: '0',
    roles: ['ADMIN', 'FINANCE'] as AdminRole[],
  },
  {
    key: 'fee.card_issuance',
    label: 'Card issuance fee',
    description: 'Charged once when a card is created.',
    type: 'minor',
    group: 'fee',
    default: '0',
    roles: ['ADMIN', 'FINANCE'] as AdminRole[],
  },
  {
    key: 'fee.fx.bps',
    label: 'FX margin',
    description: 'Basis points added on a currency conversion.',
    type: 'bps',
    group: 'fee',
    default: '0',
    roles: ['ADMIN', 'FINANCE'] as AdminRole[],
  },
  {
    key: 'fee.monthly',
    label: 'Monthly plan fee',
    description: 'Recurring charge per account on a paid plan.',
    type: 'minor',
    group: 'fee',
    default: '0',
    roles: ['ADMIN', 'FINANCE'] as AdminRole[],
  },

  // ---- Operational thresholds. ----
  {
    key: 'limits.max_cards_per_user',
    label: 'Maximum cards per user',
    description: 'Open cards one account may hold at once.',
    type: 'integer',
    group: 'limits',
    default: '20',
    roles: ['ADMIN'] as AdminRole[],
  },
];

const BY_KEY = new Map(SETTINGS.map((s) => [s.key, s]));

@Injectable()
export class SettingsService {
  private readonly logger = new Logger(SettingsService.name);
  private readonly config: AppConfig;

  constructor(
    private readonly prisma: PrismaService,
    configService: ConfigService<{ app: AppConfig }, true>,
  ) {
    this.config = configService.get('app', { infer: true });
  }

  /** Every setting with its current value, falling back to the default. */
  async all(): Promise<
    (SettingDefinition & { value: string; updatedAt: string | null; isDefault: boolean })[]
  > {
    const rows = await this.prisma.setting.findMany();
    const stored = new Map(rows.map((row) => [row.key, row]));

    return SETTINGS.map((definition) => {
      const row = stored.get(definition.key);
      return {
        ...definition,
        value: row?.value ?? definition.default,
        updatedAt: row?.updatedAt.toISOString() ?? null,
        isDefault: !row,
      };
    });
  }

  /** One value, parsed. Falls back to the registry default. */
  async get(key: string): Promise<bigint> {
    const definition = BY_KEY.get(key);
    if (!definition) throw new ValidationError(`Unknown setting: ${key}`);

    const row = await this.prisma.setting.findUnique({ where: { key } });
    return BigInt(row?.value ?? definition.default);
  }

  /** Several at once, so a caller does not issue one query per key. */
  async getMany(keys: string[]): Promise<Record<string, bigint>> {
    const rows = await this.prisma.setting.findMany({ where: { key: { in: keys } } });
    const stored = new Map(rows.map((row) => [row.key, row.value]));

    const out: Record<string, bigint> = {};
    for (const key of keys) {
      const definition = BY_KEY.get(key);
      if (!definition) continue;
      out[key] = BigInt(stored.get(key) ?? definition.default);
    }
    return out;
  }

  /**
   * Change a value.
   *
   * Mirrors how a balance correction works: the reason is mandatory, and the
   * change lands in `admin_actions` and `audit_logs` alongside the old value.
   * Nothing here is silently editable.
   */
  async set(params: {
    adminId: string;
    adminRole: AdminRole;
    key: string;
    value: string;
    reason: string;
  }): Promise<{ key: string; value: string }> {
    const definition = BY_KEY.get(params.key);
    if (!definition) throw new ValidationError(`Unknown setting: ${params.key}`);

    // SUPER_ADMIN satisfies every requirement, matching the guard and the
    // second check in AdminService. Everyone else must match exactly.
    if (
      params.adminRole !== 'SUPER_ADMIN' &&
      !definition.roles.includes(params.adminRole)
    ) {
      throw new ValidationError(`Your role may not change ${definition.label}.`);
    }

    const reason = params.reason?.trim();
    if (!reason || reason.length < 3) {
      throw new ValidationError('A reason is required for every settings change.');
    }

    const value = this.parse(definition, params.value);
    const previous = await this.prisma.setting.findUnique({ where: { key: params.key } });
    const before = previous?.value ?? definition.default;

    await this.prisma.$transaction(async (tx) => {
      await tx.setting.upsert({
        where: { key: params.key },
        create: { key: params.key, value, updatedById: params.adminId },
        update: { value, updatedById: params.adminId },
      });

      await tx.adminAction.create({
        data: {
          adminUserId: params.adminId,
          type: AdminActionType.SETTING_UPDATED,
          targetType: 'setting',
          targetId: params.key,
          reason,
          metadata: { before, after: value },
        },
      });

      await tx.auditLog.create({
        data: {
          adminUserId: params.adminId,
          actorType: 'ADMIN',
          actorId: params.adminId,
          action: 'setting.updated',
          entityType: 'setting',
          entityId: params.key,
          before: { value: before },
          after: { value },
          reason,
        },
      });
    });

    this.logger.log(`Setting ${params.key}: ${before} -> ${value} by admin ${params.adminId}`);
    return { key: params.key, value };
  }

  private parse(definition: SettingDefinition, raw: string): string {
    const trimmed = String(raw ?? '').trim();
    if (!/^\d+$/.test(trimmed)) {
      throw new ValidationError(
        `${definition.label} must be a whole, non-negative number (${definition.type}).`,
      );
    }

    const value = BigInt(trimmed);
    if (definition.type === 'bps' && value > 10_000n) {
      throw new ValidationError(`${definition.label} cannot exceed 10000 bps (100%).`);
    }
    if (definition.type === 'integer' && value > 100_000n) {
      throw new ValidationError(`${definition.label} is implausibly large.`);
    }
    return value.toString();
  }

  /**
   * Which credentials are loaded, without revealing any of them.
   *
   * The fingerprint is the first eight hex characters of the SHA-256 of the
   * value. It is enough to confirm that two environments hold the same key, or
   * that a rotation actually took effect, and it discloses nothing usable.
   */
  credentialStatus(): {
    key: string;
    label: string;
    configured: boolean;
    fingerprint: string | null;
    note: string;
  }[] {
    const fingerprint = (value?: string | null) =>
      value ? createHash('sha256').update(value).digest('hex').slice(0, 8) : null;

    return [
      {
        key: 'LITHIC_API_KEY',
        label: 'Card issuer API key',
        configured: !!this.config.lithic.apiKey,
        fingerprint: fingerprint(this.config.lithic.apiKey),
        note: `Environment: ${this.config.lithic.environment}`,
      },
      {
        key: 'LITHIC_WEBHOOK_SECRET',
        label: 'Card issuer webhook secret',
        configured: !!this.config.lithic.webhookSecret,
        fingerprint: fingerprint(this.config.lithic.webhookSecret),
        note: 'Verifies inbound card events.',
      },
      {
        key: 'LITHIC_ASA_SECRET',
        label: 'Authorization stream secret',
        configured: !!this.config.lithic.asaSecret,
        fingerprint: fingerprint(this.config.lithic.asaSecret),
        note: 'The only authentication on live authorization decisions.',
      },
      {
        key: 'ALCHEMY_API_KEY',
        label: 'Blockchain provider key',
        configured: !!this.config.alchemy.apiKey,
        fingerprint: fingerprint(this.config.alchemy.apiKey),
        note: 'Reads transfers and confirmations.',
      },
      {
        key: 'ALCHEMY_WEBHOOK_SIGNING_KEY',
        label: 'Deposit webhook signing key',
        configured: !!this.config.alchemy.webhookSigningKey,
        fingerprint: fingerprint(this.config.alchemy.webhookSigningKey),
        note: 'A forged deposit webhook credits real balance. Never leave unset.',
      },
      {
        key: 'DEPOSIT_XPUB',
        label: 'Deposit account xpub (watch-only)',
        configured: !!this.config.deposits.xpub,
        fingerprint: fingerprint(this.config.deposits.xpub),
        note:
          'Every customer deposit address derives from this. Changing it redirects ' +
          'all future deposits, so it is environment-only and never editable here.',
      },
    ];
  }
}
