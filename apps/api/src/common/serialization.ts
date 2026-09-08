/**
 * JSON serialization helpers.
 *
 * bigint has no JSON representation and `JSON.stringify` throws on it. Rather
 * than converting money to `number` (which silently loses precision above 2^53)
 * every monetary value crosses the wire as a decimal STRING of minor units.
 */

export function bigintToString<T>(value: T): unknown {
  if (typeof value === 'bigint') return value.toString();
  if (value === null || value === undefined) return value;
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(bigintToString);

  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = bigintToString(v);
    }
    return out;
  }
  return value;
}

/** Installs a global bigint -> string JSON serializer for Express responses. */
export function installBigIntSerializer(): void {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (BigInt.prototype as any).toJSON = function toJSON(this: bigint) {
    return this.toString();
  };
}
