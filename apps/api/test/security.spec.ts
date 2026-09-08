import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  encrypt,
  decrypt,
  safeEqual,
  verifyAlchemySignature,
  verifyLithicSignature,
} from '../src/common/crypto.util';
import { redact, redactString } from '../src/common/redact';

const SECRET = 'whsec_dGVzdC1zZWNyZXQtbWF0ZXJpYWwtZm9yLXVuaXQtdGVzdHM=';

function signLithic(body: string, id: string, timestamp: string) {
  const key = Buffer.from(SECRET.slice(6), 'base64');
  return `v1,${createHmac('sha256', key).update(`${id}.${timestamp}.${body}`).digest('base64')}`;
}

describe('webhook signature verification', () => {
  const body = JSON.stringify({ token: 'abc', amount: 1000 });
  const id = 'msg_123';
  const now = () => String(Math.floor(Date.now() / 1000));

  it('accepts a correctly signed Lithic webhook', () => {
    const timestamp = now();
    const result = verifyLithicSignature({
      secret: SECRET,
      webhookId: id,
      webhookTimestamp: timestamp,
      rawBody: body,
      signatureHeader: signLithic(body, id, timestamp),
    });
    expect(result.valid).toBe(true);
  });

  it('rejects a tampered body', () => {
    const timestamp = now();
    const signature = signLithic(body, id, timestamp);

    const result = verifyLithicSignature({
      secret: SECRET,
      webhookId: id,
      webhookTimestamp: timestamp,
      rawBody: JSON.stringify({ token: 'abc', amount: 999_999 }),
      signatureHeader: signature,
    });

    expect(result.valid).toBe(false);
    expect(result.reason).toBe('signature_mismatch');
  });

  it('rejects a replayed timestamp outside the tolerance window', () => {
    const stale = String(Math.floor(Date.now() / 1000) - 3600);
    const result = verifyLithicSignature({
      secret: SECRET,
      webhookId: id,
      webhookTimestamp: stale,
      rawBody: body,
      signatureHeader: signLithic(body, id, stale),
    });

    expect(result.valid).toBe(false);
    expect(result.reason).toBe('timestamp_out_of_tolerance');
  });

  it('rejects when no secret is configured rather than passing through', () => {
    const result = verifyLithicSignature({
      secret: '',
      webhookId: id,
      webhookTimestamp: now(),
      rawBody: body,
      signatureHeader: 'v1,anything',
    });
    expect(result.valid).toBe(false);
  });

  it('accepts any one of several signatures during secret rotation', () => {
    const timestamp = now();
    const valid = signLithic(body, id, timestamp);

    const result = verifyLithicSignature({
      secret: SECRET,
      webhookId: id,
      webhookTimestamp: timestamp,
      rawBody: body,
      signatureHeader: `v1,AAAAinvalidAAAA= ${valid}`,
    });
    expect(result.valid).toBe(true);
  });

  it('verifies an Alchemy signature over the raw body', () => {
    const key = 'alchemy-signing-key';
    const signature = createHmac('sha256', key).update(body).digest('hex');

    expect(
      verifyAlchemySignature({ signingKey: key, rawBody: body, signatureHeader: signature }).valid,
    ).toBe(true);

    expect(
      verifyAlchemySignature({
        signingKey: key,
        rawBody: body,
        signatureHeader: signature.replace(/.$/, '0'),
      }).valid,
    ).toBe(false);
  });
});

describe('safeEqual', () => {
  it('compares equal strings', () => {
    expect(safeEqual('abcdef', 'abcdef')).toBe(true);
  });

  it('returns false for different lengths without throwing', () => {
    // Node's timingSafeEqual throws on length mismatch; this wrapper must not.
    expect(() => safeEqual('short', 'a-much-longer-value')).not.toThrow();
    expect(safeEqual('short', 'a-much-longer-value')).toBe(false);
  });
});

describe('encryption', () => {
  const key = 'a'.repeat(64);

  it('round-trips a value', () => {
    const plaintext = 'sensitive-value-123';
    expect(decrypt(encrypt(plaintext, key), key)).toBe(plaintext);
  });

  it('produces a different ciphertext each time (random IV)', () => {
    expect(encrypt('same', key)).not.toBe(encrypt('same', key));
  });

  it('rejects a tampered ciphertext via the GCM auth tag', () => {
    const encrypted = encrypt('secret', key);
    const tampered = `${encrypted.slice(0, -4)}AAAA`;
    expect(() => decrypt(tampered, key)).toThrow();
  });

  it('rejects a key of the wrong length', () => {
    expect(() => encrypt('x', 'tooshort')).toThrow(/32 bytes/);
  });
});

describe('log redaction', () => {
  it('redacts credential-bearing keys', () => {
    const output = redact({
      password: 'hunter2',
      pan: '4111111111111111',
      cvv: '123',
      apiKey: 'sk_live_abc',
      authorization: 'Bearer xyz',
      governmentId: '111-23-1234',
    }) as Record<string, string>;

    for (const value of Object.values(output)) {
      expect(value).toBe('[REDACTED]');
    }
  });

  it('keeps identifiers that are not credentials', () => {
    const output = redact({
      card_token: 'c6cffee5-9c1f-4f4a',
      transaction_token: 'txn_123',
    }) as Record<string, string>;

    expect(output.card_token).toBe('c6cffee5-9c1f-4f4a');
    expect(output.transaction_token).toBe('txn_123');
  });

  it('masks a bare PAN embedded in free text', () => {
    // 4111111111111111 is Luhn-valid; the last four survive for support.
    const masked = redactString('charge failed for 4111111111111111 at merchant');
    expect(masked).not.toContain('4111111111111111');
    expect(masked).toContain('1111');
  });

  it('leaves Luhn-invalid digit runs alone', () => {
    const text = 'order 1234567890123456 reference';
    expect(redactString(text)).toBe(text);
  });

  it('handles nested structures, bigints and cycles', () => {
    const cyclic: Record<string, unknown> = { password: 'x', amount: 100n };
    cyclic.self = cyclic;

    const output = redact(cyclic) as Record<string, unknown>;
    expect(output.password).toBe('[REDACTED]');
    expect(output.amount).toBe('100');
    expect(output.self).toBe('[CIRCULAR]');
  });
});
