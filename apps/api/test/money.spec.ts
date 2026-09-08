import { describe, expect, it } from 'vitest';
import {
  formatAmount,
  fromTokenRawValue,
  parseAmount,
  usdCentsToUsdt,
  usdtToUsdCents,
} from '@tenzopay/shared';

describe('money', () => {
  describe('parseAmount', () => {
    it('parses whole and fractional USDT to minor units', () => {
      expect(parseAmount('1', 'USDT')).toBe(1_000_000n);
      expect(parseAmount('1.5', 'USDT')).toBe(1_500_000n);
      expect(parseAmount('0.000001', 'USDT')).toBe(1n);
      expect(parseAmount('12500', 'USDT')).toBe(12_500_000_000n);
    });

    it('accepts grouped input and negatives', () => {
      expect(parseAmount('1,234.56', 'USDT')).toBe(1_234_560_000n);
      expect(parseAmount('-100.25', 'USDT')).toBe(-100_250_000n);
    });

    it('refuses precision it cannot represent rather than silently rounding', () => {
      // This is the whole point: a seventh decimal place would be lost, and
      // losing a fraction of a cent quietly is how ledgers drift.
      expect(() => parseAmount('1.0000001', 'USDT')).toThrow(/precision/i);
      expect(() => parseAmount('0.001', 'USD')).toThrow(/precision/i);
    });

    it('rejects malformed input', () => {
      for (const bad of ['', '.', '-', 'abc', '1.2.3', '1e5']) {
        expect(() => parseAmount(bad, 'USDT')).toThrow();
      }
    });

    it('survives values far beyond Number.MAX_SAFE_INTEGER', () => {
      // 10 billion USDT is 1e16 minor units — past 2^53, where a float would
      // start losing whole units.
      const huge = parseAmount('10000000000.123456', 'USDT');
      expect(huge).toBe(10_000_000_000_123_456n);
      expect(huge > BigInt(Number.MAX_SAFE_INTEGER)).toBe(true);
    });
  });

  describe('formatAmount', () => {
    it('formats minor units for display', () => {
      expect(formatAmount(10_240_520_000n, 'USDT')).toBe('10,240.52');
      expect(formatAmount(0n, 'USDT')).toBe('0.00');
      expect(formatAmount(-100_250_000n, 'USDT')).toBe('-100.25');
    });

    it('truncates rather than rounding up', () => {
      // Showing 1.00 for 0.999999 is wrong in the direction that flatters the
      // balance; truncation is the safe direction.
      expect(formatAmount(999_999n, 'USDT')).toBe('0.99');
    });

    it('round-trips through parseAmount', () => {
      for (const value of ['0.01', '1.00', '999.99', '1234567.89']) {
        expect(formatAmount(parseAmount(value, 'USDT'), 'USDT')).toBe(
          value.replace(/\B(?=(\d{3})+(?!\d)\.)/g, ','),
        );
      }
    });
  });

  describe('fromTokenRawValue', () => {
    it('passes through matching decimals', () => {
      expect(fromTokenRawValue('1000000', 6, 'USDT')).toBe(1_000_000n);
    });

    it('scales an 18-decimal token down without inflating the credit', () => {
      // A token with 18 decimals must not be credited 1e12 times too large.
      expect(fromTokenRawValue(10n ** 18n, 18, 'USDT')).toBe(1_000_000n);
    });

    it('truncates rather than rounding up when scaling down', () => {
      // 1.999999999999e12 raw wei-scale units is 1.999999 USDT-minor; we
      // credit 1, never 2. Rounding up would create money out of dust.
      expect(fromTokenRawValue(1_999_999_999_999n, 18, 'USDT')).toBe(1n);
    });

    it('discards sub-unit dust entirely', () => {
      // Below one USDT minor unit, nothing is credited.
      expect(fromTokenRawValue(999_999_999_999n, 18, 'USDT')).toBe(0n);
    });

    it('scales a low-decimal token up', () => {
      expect(fromTokenRawValue('100', 2, 'USDT')).toBe(1_000_000n);
    });
  });

  describe('USDT <-> USD conversion', () => {
    it('converts between the ledger and card units', () => {
      expect(usdtToUsdCents(100_000_000n)).toBe(10_000n); // 100 USDT -> $100.00
      expect(usdCentsToUsdt(10_000n)).toBe(100_000_000n);
    });

    it('round-trips at cent granularity', () => {
      expect(usdtToUsdCents(usdCentsToUsdt(12_345n))).toBe(12_345n);
    });
  });
});
