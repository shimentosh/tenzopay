/**
 * Log redaction.
 *
 * Nothing in TenzoPay may log a PAN, CVV, PIN, password, API key or session
 * token. This module is the single chokepoint used by the logger and by the
 * webhook/provider layers before anything is persisted or printed.
 */

const SENSITIVE_KEY = /^(pan|cvv|cvc|pin|password|passwordHash|secret|token|api[_-]?key|authorization|cookie|refresh[_-]?token|access[_-]?token|governmentId|government_id|ssn|privateKey|xpub|signingKey)$/i;

/** Keys that are *identifiers* rather than credentials and are safe to keep. */
const SAFE_TOKEN_KEY = /^(card_token|account_token|cardToken|accountToken|transaction_token|transactionToken|event_token|eventToken|providerCardToken|providerAccountToken|providerTransactionToken|account_holder_token|financial_account_token|auth_rule_token|idempotencyKey|csrfToken|verificationToken|pageKey)$/;

export const REDACTED = '[REDACTED]';

/** A bare PAN appearing anywhere in a string (13–19 digits, optional separators). */
const PAN_PATTERN = /\b(?:\d[ -]?){13,19}\b/g;

export function redactString(value: string): string {
  return value.replace(PAN_PATTERN, (match) => {
    const digits = match.replace(/\D/g, '');
    if (digits.length < 13 || digits.length > 19) return match;
    if (!isLuhnValid(digits)) return match; // not a card number, leave it alone
    return `${REDACTED}(**** ${digits.slice(-4)})`;
  });
}

/** Deep-redacts an arbitrary value. Cycle-safe and depth-bounded. */
export function redact<T>(input: T, depth = 0, seen = new WeakSet<object>()): unknown {
  if (depth > 12) return '[MAX_DEPTH]';
  if (input === null || input === undefined) return input;

  if (typeof input === 'string') return redactString(input);
  if (typeof input === 'bigint') return input.toString();
  if (typeof input !== 'object') return input;

  if (seen.has(input as object)) return '[CIRCULAR]';
  seen.add(input as object);

  if (Array.isArray(input)) {
    return input.slice(0, 200).map((v) => redact(v, depth + 1, seen));
  }

  if (input instanceof Date) return input.toISOString();
  if (input instanceof Error) {
    return { name: input.name, message: redactString(input.message) };
  }

  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
    if (SAFE_TOKEN_KEY.test(key)) {
      out[key] = value;
    } else if (SENSITIVE_KEY.test(key)) {
      out[key] = REDACTED;
    } else {
      out[key] = redact(value, depth + 1, seen);
    }
  }
  return out;
}

function isLuhnValid(digits: string): boolean {
  let sum = 0;
  let double = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let d = digits.charCodeAt(i) - 48;
    if (double) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
    double = !double;
  }
  return sum % 10 === 0;
}

/** JSON.stringify replacer that survives bigint and redacts as it goes. */
export function safeStringify(value: unknown): string {
  return JSON.stringify(redact(value));
}
