import { z } from 'zod';

/**
 * Environment validation.
 *
 * The API refuses to boot on invalid configuration rather than failing later at
 * an awkward moment (e.g. mid-authorization). Several cross-field rules exist
 * specifically to make it impossible to run fake money in production.
 */

const bool = (def: boolean) =>
  z
    .string()
    .optional()
    .transform((v) => (v === undefined ? def : v === 'true' || v === '1'));

const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    APP_ENV: z.enum(['development', 'sandbox', 'production']).default('development'),
    API_PORT: z.coerce.number().int().min(1).max(65535).default(4000),
    API_URL: z.string().url().default('http://localhost:4000'),
    WEB_URL: z.string().url().default('http://localhost:3000'),
    ADMIN_URL: z.string().url().default('http://localhost:7317'),
    CORS_ORIGINS: z.string().default('http://localhost:3000,http://localhost:7317'),

    DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),

    JWT_ACCESS_SECRET: z.string().min(32, 'JWT_ACCESS_SECRET must be >= 32 chars'),
    JWT_REFRESH_SECRET: z.string().min(32, 'JWT_REFRESH_SECRET must be >= 32 chars'),
    JWT_ACCESS_TTL: z.string().default('15m'),
    JWT_REFRESH_TTL: z.string().default('30d'),
    ENCRYPTION_KEY: z
      .string()
      .regex(/^[0-9a-fA-F]{64}$/, 'ENCRYPTION_KEY must be 64 hex chars (32 bytes)'),
    COOKIE_DOMAIN: z.string().default('localhost'),
    COOKIE_SECURE: bool(false),

    CARD_PROVIDER: z.enum(['lithic', 'mock']).default('mock'),
    LITHIC_API_KEY: z.string().optional(),
    LITHIC_ENVIRONMENT: z.enum(['sandbox', 'production']).default('sandbox'),
    LITHIC_WEBHOOK_SECRET: z.string().optional(),
    LITHIC_ASA_SECRET: z.string().optional(),
    LITHIC_ASA_RESPONDER_URL: z.string().optional(),

    BLOCKCHAIN_PROVIDER: z.enum(['alchemy', 'mock']).default('mock'),
    ALCHEMY_API_KEY: z.string().optional(),
    ALCHEMY_AUTH_TOKEN: z.string().optional(),
    ALCHEMY_WEBHOOK_SIGNING_KEY: z.string().optional(),

    DEPOSIT_MODE: z.enum(['demo', 'sandbox', 'production']).default('demo'),
    DEPOSIT_NETWORK: z
      .enum(['ETHEREUM_MAINNET', 'ETHEREUM_SEPOLIA'])
      .default('ETHEREUM_SEPOLIA'),
    USDT_CONTRACT_ADDRESS_MAINNET: z
      .string()
      .default('0xdAC17F958D2ee523a2206206994597C13D831ec7'),
    USDT_CONTRACT_ADDRESS_SEPOLIA: z.string().optional(),
    USDT_DECIMALS: z.coerce.number().int().min(0).max(18).default(6),
    DEPOSIT_CONFIRMATIONS: z.coerce.number().int().min(1).max(200).default(12),
    DEPOSIT_MIN_AMOUNT: z.coerce.bigint().default(1_000_000n),
    DEPOSIT_XPUB: z.string().optional(),

    SEED_ADMIN_EMAIL: z.string().email().default('admin@tenzopay.dev'),
    SEED_ADMIN_PASSWORD: z.string().default('ChangeMe!2026'),
    SEED_DEMO_USER_EMAIL: z.string().email().default('demo@tenzopay.dev'),
    SEED_DEMO_USER_PASSWORD: z.string().default('ChangeMe!2026'),
  })
  // --- Cross-field safety rules ------------------------------------------
  .refine((c) => c.CARD_PROVIDER !== 'lithic' || !!c.LITHIC_API_KEY, {
    message: 'LITHIC_API_KEY is required when CARD_PROVIDER=lithic',
    path: ['LITHIC_API_KEY'],
  })
  .refine((c) => c.BLOCKCHAIN_PROVIDER !== 'alchemy' || !!c.ALCHEMY_API_KEY, {
    message: 'ALCHEMY_API_KEY is required when BLOCKCHAIN_PROVIDER=alchemy',
    path: ['ALCHEMY_API_KEY'],
  })
  // Demo money must never be reachable in a production deployment.
  .refine((c) => !(c.APP_ENV === 'production' && c.DEPOSIT_MODE === 'demo'), {
    message:
      'DEPOSIT_MODE=demo is forbidden when APP_ENV=production. Simulated funds must ' +
      'never be presented as real. Set DEPOSIT_MODE=production and configure custody.',
    path: ['DEPOSIT_MODE'],
  })
  .refine((c) => !(c.APP_ENV === 'production' && c.CARD_PROVIDER === 'mock'), {
    message: 'CARD_PROVIDER=mock is forbidden when APP_ENV=production',
    path: ['CARD_PROVIDER'],
  })
  // Production deposits require real custody, which this codebase does not have.
  .refine((c) => c.DEPOSIT_MODE !== 'production' || !!c.DEPOSIT_XPUB, {
    message:
      'DEPOSIT_MODE=production requires DEPOSIT_XPUB and a custody provider. ' +
      'See docs/ARCHITECTURE.md §13 — custody is NOT implemented in this build.',
    path: ['DEPOSIT_XPUB'],
  })
  .refine(
    (c) =>
      c.DEPOSIT_MODE !== 'sandbox' ||
      c.DEPOSIT_NETWORK !== 'ETHEREUM_MAINNET',
    {
      message: 'DEPOSIT_MODE=sandbox must not point at ETHEREUM_MAINNET',
      path: ['DEPOSIT_NETWORK'],
    },
  )
  .refine(
    (c) =>
      c.APP_ENV !== 'production' || c.LITHIC_ENVIRONMENT === 'production',
    {
      message: 'APP_ENV=production requires LITHIC_ENVIRONMENT=production',
      path: ['LITHIC_ENVIRONMENT'],
    },
  );

export type AppConfig = ReturnType<typeof buildConfig>;

export function buildConfig(raw: NodeJS.ProcessEnv = process.env) {
  const parsed = envSchema.safeParse(raw);

  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join('.') || '(root)'}: ${i.message}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }

  const c = parsed.data;

  const usdtContract =
    c.DEPOSIT_NETWORK === 'ETHEREUM_MAINNET'
      ? c.USDT_CONTRACT_ADDRESS_MAINNET
      : c.USDT_CONTRACT_ADDRESS_SEPOLIA ?? '';

  return {
    nodeEnv: c.NODE_ENV,
    appEnv: c.APP_ENV,
    isProduction: c.APP_ENV === 'production',
    port: c.API_PORT,
    apiUrl: c.API_URL,
    webUrl: c.WEB_URL,
    adminUrl: c.ADMIN_URL,
    corsOrigins: c.CORS_ORIGINS.split(',').map((s) => s.trim()).filter(Boolean),

    databaseUrl: c.DATABASE_URL,

    auth: {
      accessSecret: c.JWT_ACCESS_SECRET,
      refreshSecret: c.JWT_REFRESH_SECRET,
      accessTtl: c.JWT_ACCESS_TTL,
      refreshTtl: c.JWT_REFRESH_TTL,
      cookieDomain: c.COOKIE_DOMAIN,
      cookieSecure: c.COOKIE_SECURE,
    },

    encryptionKey: c.ENCRYPTION_KEY,

    lithic: {
      enabled: c.CARD_PROVIDER === 'lithic',
      apiKey: c.LITHIC_API_KEY ?? '',
      environment: c.LITHIC_ENVIRONMENT,
      baseUrl:
        c.LITHIC_ENVIRONMENT === 'production'
          ? 'https://api.lithic.com'
          : 'https://sandbox.lithic.com',
      webhookSecret: c.LITHIC_WEBHOOK_SECRET ?? '',
      asaSecret: c.LITHIC_ASA_SECRET ?? '',
      asaResponderUrl: c.LITHIC_ASA_RESPONDER_URL ?? '',
    },

    alchemy: {
      enabled: c.BLOCKCHAIN_PROVIDER === 'alchemy',
      apiKey: c.ALCHEMY_API_KEY ?? '',
      authToken: c.ALCHEMY_AUTH_TOKEN ?? '',
      webhookSigningKey: c.ALCHEMY_WEBHOOK_SIGNING_KEY ?? '',
    },

    deposits: {
      mode: c.DEPOSIT_MODE,
      isDemo: c.DEPOSIT_MODE === 'demo',
      network: c.DEPOSIT_NETWORK,
      usdtContract,
      usdtDecimals: c.USDT_DECIMALS,
      confirmations: c.DEPOSIT_CONFIRMATIONS,
      minAmount: c.DEPOSIT_MIN_AMOUNT,
      xpub: c.DEPOSIT_XPUB ?? '',
    },

    seed: {
      adminEmail: c.SEED_ADMIN_EMAIL,
      adminPassword: c.SEED_ADMIN_PASSWORD,
      demoUserEmail: c.SEED_DEMO_USER_EMAIL,
      demoUserPassword: c.SEED_DEMO_USER_PASSWORD,
    },
  };
}
