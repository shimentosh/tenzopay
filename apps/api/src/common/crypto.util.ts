import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

/**
 * Cryptographic helpers.
 *
 * All signature comparisons in this file use timingSafeEqual. A plain `===` on
 * a signature leaks its prefix through response timing and is a real, exploited
 * attack against webhook endpoints.
 */

const IV_LENGTH = 12; // GCM standard
const TAG_LENGTH = 16;

/** AES-256-GCM. Output: base64(iv | tag | ciphertext). */
export function encrypt(plaintext: string, keyHex: string): string {
  const key = Buffer.from(keyHex, 'hex');
  if (key.length !== 32) throw new Error('ENCRYPTION_KEY must be 32 bytes');

  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();

  return Buffer.concat([iv, tag, ciphertext]).toString('base64');
}

export function decrypt(payload: string, keyHex: string): string {
  const key = Buffer.from(keyHex, 'hex');
  const buf = Buffer.from(payload, 'base64');

  const iv = buf.subarray(0, IV_LENGTH);
  const tag = buf.subarray(IV_LENGTH, IV_LENGTH + TAG_LENGTH);
  const ciphertext = buf.subarray(IV_LENGTH + TAG_LENGTH);

  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
}

export function sha256Hex(input: string | Buffer): string {
  return createHash('sha256').update(input).digest('hex');
}

export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString('base64url');
}

/** Constant-time comparison that never throws on length mismatch. */
export function safeEqual(a: string | Buffer, b: string | Buffer): boolean {
  const bufA = Buffer.isBuffer(a) ? a : Buffer.from(a, 'utf8');
  const bufB = Buffer.isBuffer(b) ? b : Buffer.from(b, 'utf8');
  if (bufA.length !== bufB.length) {
    // Still burn a comparison so the timing does not reveal the length check.
    timingSafeEqual(bufA, bufA);
    return false;
  }
  return timingSafeEqual(bufA, bufB);
}

/**
 * Verify a Lithic webhook / ASA signature.
 *
 * Lithic follows the Standard Webhooks spec:
 *   signed content = `{webhook-id}.{webhook-timestamp}.{raw body}`
 *   key            = base64-decoded material after the `whsec_` prefix
 *   header         = `webhook-signature: v1,<base64sig> v1,<base64sig> ...`
 *
 * Multiple space-separated signatures may be present during secret rotation;
 * a match against any one of them is a pass.
 */
export function verifyLithicSignature(params: {
  secret: string;
  webhookId: string;
  webhookTimestamp: string;
  rawBody: Buffer | string;
  signatureHeader: string;
  toleranceSeconds?: number;
}): { valid: boolean; reason?: string } {
  const { secret, webhookId, webhookTimestamp, rawBody, signatureHeader } = params;
  const tolerance = params.toleranceSeconds ?? 300;

  if (!secret) return { valid: false, reason: 'no_secret_configured' };
  if (!webhookId || !webhookTimestamp || !signatureHeader) {
    return { valid: false, reason: 'missing_headers' };
  }

  // Replay window.
  const ts = Number(webhookTimestamp);
  if (!Number.isFinite(ts)) return { valid: false, reason: 'bad_timestamp' };
  const skew = Math.abs(Math.floor(Date.now() / 1000) - ts);
  if (skew > tolerance) return { valid: false, reason: 'timestamp_out_of_tolerance' };

  const keyMaterial = secret.startsWith('whsec_') ? secret.slice(6) : secret;
  const key = Buffer.from(keyMaterial, 'base64');

  const body = Buffer.isBuffer(rawBody) ? rawBody.toString('utf8') : rawBody;
  const signedContent = `${webhookId}.${webhookTimestamp}.${body}`;
  const expected = createHmac('sha256', key).update(signedContent).digest('base64');

  const presented = signatureHeader.split(' ').map((part) => {
    const idx = part.indexOf(',');
    return idx === -1 ? part : part.slice(idx + 1);
  });

  for (const candidate of presented) {
    if (safeEqual(candidate, expected)) return { valid: true };
  }
  return { valid: false, reason: 'signature_mismatch' };
}

/**
 * Verify an Alchemy webhook signature.
 *
 * Alchemy: HMAC-SHA256 of the RAW request body using the webhook's signing key,
 * hex-encoded, delivered in `x-alchemy-signature`.
 */
export function verifyAlchemySignature(params: {
  signingKey: string;
  rawBody: Buffer | string;
  signatureHeader: string;
}): { valid: boolean; reason?: string } {
  const { signingKey, rawBody, signatureHeader } = params;

  if (!signingKey) return { valid: false, reason: 'no_signing_key_configured' };
  if (!signatureHeader) return { valid: false, reason: 'missing_signature_header' };

  const body = Buffer.isBuffer(rawBody) ? rawBody : Buffer.from(rawBody, 'utf8');
  const expected = createHmac('sha256', signingKey).update(body).digest('hex');

  return safeEqual(signatureHeader, expected)
    ? { valid: true }
    : { valid: false, reason: 'signature_mismatch' };
}
