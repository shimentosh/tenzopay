/**
 * Money handling for TenzoPay.
 *
 * Every monetary value in this system is an integer count of MINOR UNITS held in
 * a bigint. Floating point is never used in the money path: `0.1 + 0.2 !== 0.3`
 * is not an acceptable property for a ledger.
 *
 *   USDT -> 6 decimals  (1 USDT = 1_000_000 minor units)
 *   USD  -> 2 decimals  (1 USD  =       100 minor units)
 */

export const DECIMALS: Record<string, number> = {
  USDT: 6,
  USD: 2,
};

export function decimalsFor(currency: string): number {
  const d = DECIMALS[currency.toUpperCase()];
  if (d === undefined) throw new Error(`Unknown currency: ${currency}`);
  return d;
}

/**
 * Parse a human decimal string ("1,234.56") into minor units.
 * Rejects anything that would silently lose precision.
 */
export function parseAmount(input: string | number, currency: string): bigint {
  const decimals = decimalsFor(currency);
  const raw = String(input).trim().replace(/,/g, '');

  if (!/^-?\d*(\.\d*)?$/.test(raw) || raw === '' || raw === '.' || raw === '-') {
    throw new Error(`Invalid amount: ${input}`);
  }

  const negative = raw.startsWith('-');
  const unsigned = negative ? raw.slice(1) : raw;
  const [whole = '0', fraction = ''] = unsigned.split('.');

  if (fraction.length > decimals) {
    throw new Error(
      `Amount ${input} has more precision than ${currency} supports (${decimals} dp)`,
    );
  }

  const padded = fraction.padEnd(decimals, '0');
  const value = BigInt(whole || '0') * 10n ** BigInt(decimals) + BigInt(padded || '0');
  return negative ? -value : value;
}

/** Format minor units for display, e.g. 10240520000n USDT -> "10,240.52" */
export function formatAmount(
  minor: bigint | string | number,
  currency: string,
  opts: { maxFractionDigits?: number; withGrouping?: boolean } = {},
): string {
  const decimals = decimalsFor(currency);
  const value = typeof minor === 'bigint' ? minor : BigInt(minor);
  const negative = value < 0n;
  const abs = negative ? -value : value;

  const divisor = 10n ** BigInt(decimals);
  const whole = abs / divisor;
  let fraction = (abs % divisor).toString().padStart(decimals, '0');

  // Trim to a sensible display precision (default 2) without rounding up.
  const maxFraction = opts.maxFractionDigits ?? Math.min(2, decimals);
  fraction = fraction.slice(0, maxFraction);

  const wholeStr =
    opts.withGrouping === false
      ? whole.toString()
      : whole.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');

  const body = maxFraction > 0 ? `${wholeStr}.${fraction}` : wholeStr;
  return negative ? `-${body}` : body;
}

/**
 * Convert an on-chain raw token value (already in the token's own decimals)
 * into our internal minor units for that currency. For USDT both are 6dp, but
 * this is explicit so a 18dp token can never be credited 1e12 times too large.
 */
export function fromTokenRawValue(
  rawValue: string | bigint,
  tokenDecimals: number,
  currency: string,
): bigint {
  const target = decimalsFor(currency);
  const raw = typeof rawValue === 'bigint' ? rawValue : BigInt(rawValue);

  if (tokenDecimals === target) return raw;
  if (tokenDecimals > target) {
    // Truncate (never round up) — we credit no more than actually received.
    return raw / 10n ** BigInt(tokenDecimals - target);
  }
  return raw * 10n ** BigInt(target - tokenDecimals);
}

/**
 * USDT (6dp) -> USD (2dp) for card authorization checks.
 *
 * NOTE: this is a 1:1 peg assumption, not an FX rate. A production system
 * needs a real quoted rate from the off-ramp provider. See docs/ARCHITECTURE.md.
 */
export function usdtToUsdCents(usdtMinor: bigint): bigint {
  return usdtMinor / 10_000n;
}

export function usdCentsToUsdt(usdCents: bigint): bigint {
  return usdCents * 10_000n;
}
