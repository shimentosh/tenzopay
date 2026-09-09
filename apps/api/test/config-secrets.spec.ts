import { describe, expect, it } from 'vitest';
import { buildConfig } from '../src/config/configuration';

const base = {
  DATABASE_URL: 'postgresql://postgres:postgres@localhost:55432/tenzopay',
  JWT_ACCESS_SECRET: 'Yb3k9Qz7Rw1Tv5Xn2Mp8Ld4Hc6Jf0GsA1',
  JWT_REFRESH_SECRET: 'Qa7Zx2Cv9Bn4Mk1Lp6Wr3Ty8Ui5Oe0DB2',
  ENCRYPTION_KEY: '9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08',
  APP_ENV: 'production',
  DEPOSIT_MODE: 'production',
  DEPOSIT_XPUB: 'xpub-watch-only',
  CARD_PROVIDER: 'lithic',
  LITHIC_API_KEY: 'k',
  LITHIC_ENVIRONMENT: 'production',
} as NodeJS.ProcessEnv;

describe('production secret validation', () => {
  it('accepts real secrets', () => {
    expect(() => buildConfig({ ...base })).not.toThrow();
  });

  it('rejects the .env.example JWT placeholder', () => {
    expect(() =>
      buildConfig({ ...base, JWT_ACCESS_SECRET: 'replace-me-with-a-long-random-string' }),
    ).toThrow(/placeholder/i);
  });

  it('rejects an all-zero ENCRYPTION_KEY', () => {
    expect(() => buildConfig({ ...base, ENCRYPTION_KEY: '0'.repeat(64) })).toThrow(/entropy|placeholder/i);
  });

  it('rejects reusing one secret for access and refresh', () => {
    expect(() =>
      buildConfig({ ...base, JWT_REFRESH_SECRET: base.JWT_ACCESS_SECRET as string }),
    ).toThrow(/must differ/i);
  });

  it('still allows placeholders outside production', () => {
    expect(() =>
      buildConfig({
        ...base,
        APP_ENV: 'development',
        DEPOSIT_MODE: 'demo',
        JWT_ACCESS_SECRET: 'replace-me-with-a-long-random-string',
      }),
    ).not.toThrow();
  });
});
