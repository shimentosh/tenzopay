import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createHmac, randomUUID } from 'node:crypto';
import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import type { Server } from 'node:http';
import {
  AuthorizationDecision,
  CardStatus,
  LedgerDirection,
  LedgerTransactionType,
} from '@prisma/client';
import { PrismaService } from '../src/prisma/prisma.service';
import { LedgerService } from '../src/ledger/ledger.service';
import { cookieFrom, createTestApp, resetDatabase, VALID_KYC } from './helpers/app';

/**
 * Auth Stream Access under load.
 *
 * ASA sits in the critical path of every card transaction. Lithic declines at
 * 6 s and recommends answering within 3 s, so latency here is a correctness
 * property, not a nice-to-have — a slow decision is a declined payment.
 *
 * Two failure modes are specifically hunted:
 *   1. **Overdraw** — concurrent authorizations on one balance both approving.
 *   2. **Spurious decline** — a legitimate authorization refused because the
 *      SERIALIZABLE transaction lost a write conflict rather than because the
 *      customer was actually short of funds. That is invisible in a
 *      correctness-only test, which happily accepts "it declined".
 */
const ASA_SECRET = 'whsec_dGVzdC1zZWNyZXQtbWF0ZXJpYWwtZm9yLXVuaXQtdGVzdHM=';

describe('ASA decisioning', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let ledger: LedgerService;
  let server: Server;
  let userId: string;
  let cookie: string;
  let cardTokens: string[] = [];

  beforeAll(async () => {
    process.env.LITHIC_ASA_SECRET = ASA_SECRET;
    ({ app, prisma } = await createTestApp());
    ledger = app.get(LedgerService);
    server = app.getHttpServer() as Server;
  });

  afterAll(async () => {
    await app.close();
  });

  /** Signs an ASA request exactly as Lithic does (Standard Webhooks). */
  function asa(payload: Record<string, unknown>) {
    const body = JSON.stringify(payload);
    const id = `msg_${randomUUID()}`;
    const timestamp = String(Math.floor(Date.now() / 1000));
    const key = Buffer.from(ASA_SECRET.slice(6), 'base64');
    const signature = createHmac('sha256', key)
      .update(`${id}.${timestamp}.${body}`)
      .digest('base64');

    return request(server)
      .post('/api/webhooks/lithic/asa')
      .set('Content-Type', 'application/json')
      .set('webhook-id', id)
      .set('webhook-timestamp', timestamp)
      .set('webhook-signature', `v1,${signature}`)
      .send(body);
  }

  const authorization = (cardToken: string, amountCents: number, token?: string) => ({
    token: token ?? `auth_${randomUUID()}`,
    card_token: cardToken,
    amount: amountCents,
    merchant: { descriptor: 'META ADS', mcc: '7311', country: 'USA' },
  });

  async function seed(options: { cards: number; balanceUsdt: bigint; limitUsd: number }) {
    const registration = await request(server).post('/api/auth/register').send({
      email: `asa-${Date.now()}@tenzopay.dev`,
      password: 'CorrectHorse123',
      firstName: 'Asa',
      lastName: 'Tester',
    });

    cookie = `tenzo_access=${cookieFrom(registration.headers, 'tenzo_access')}`;
    userId = registration.body.user.id;

    await request(server).post('/api/kyc/submit').set('Cookie', cookie).send(VALID_KYC);
    await ledger.creditDeposit({
      userId,
      depositId: `asa-funding-${randomUUID()}`,
      amount: options.balanceUsdt,
    });

    cardTokens = [];
    for (let i = 0; i < options.cards; i++) {
      const created = await request(server)
        .post('/api/cards')
        .set('Cookie', cookie)
        .send({
          name: `Card ${i}`,
          dailyLimitUsd: options.limitUsd,
          monthlyLimitUsd: options.limitUsd * 30,
        });

      const card = await prisma.card.findUniqueOrThrow({
        where: { id: created.body.id },
        select: { providerCardToken: true },
      });
      cardTokens.push(card.providerCardToken);
    }
  }

  beforeEach(async () => {
    await resetDatabase(prisma);
  });

  describe('correctness under concurrency', () => {
    it('never overdraws when many cards authorize simultaneously', async () => {
      // 1,000 USDT, ten cards, each asking for 300 USDT at once.
      // At most three can legitimately succeed.
      await seed({ cards: 10, balanceUsdt: 1_000_000_000n, limitUsd: 10_000 });

      const responses = await Promise.all(
        cardTokens.map((token) => asa(authorization(token, 30_000))),
      );

      const approved = responses.filter((r) => r.body.result === 'APPROVED');
      expect(approved.length).toBeLessThanOrEqual(3);
      expect(approved.length).toBeGreaterThan(0);

      const balance = await ledger.getBalance(userId);
      expect(balance.available).toBeGreaterThanOrEqual(0n);
      // Conservation: holds move money, they never create or destroy it.
      expect(balance.total).toBe(1_000_000_000n);
      expect(balance.held).toBe(BigInt(approved.length) * 300_000_000n);

      expect((await ledger.verifyIntegrity()).ok).toBe(true);
    });

    it('does not spuriously decline when funds are plentiful', async () => {
      /**
       * The important one. Ten concurrent authorizations of 1 USDT against a
       * 10,000 USDT balance are all clearly affordable. Any decline here is
       * NOT a funds problem — it means a SERIALIZABLE write conflict was
       * surfaced to the cardholder as INSUFFICIENT_FUNDS, which would decline
       * real payments at random under load.
       */
      await seed({ cards: 10, balanceUsdt: 10_000_000_000n, limitUsd: 10_000 });

      const responses = await Promise.all(
        cardTokens.map((token) => asa(authorization(token, 100))),
      );

      const declined = responses.filter((r) => r.body.result !== 'APPROVED');
      const reasons = await prisma.authorizationEvent.findMany({
        where: { decision: { not: AuthorizationDecision.APPROVED } },
        select: { decision: true, reason: true },
      });

      expect(
        declined.length,
        `${declined.length}/10 affordable authorizations were declined. Reasons: ${JSON.stringify(reasons)}`,
      ).toBe(0);

      const balance = await ledger.getBalance(userId);
      expect(balance.held).toBe(10n * 1_000_000n);
    });

    it('holds once when Lithic retries the same authorization concurrently', async () => {
      await seed({ cards: 1, balanceUsdt: 1_000_000_000n, limitUsd: 10_000 });

      const eventToken = `auth_${randomUUID()}`;
      const responses = await Promise.all(
        Array.from({ length: 5 }, () =>
          asa(authorization(cardTokens[0], 10_000, eventToken)),
        ),
      );

      const results = new Set(responses.map((r) => r.body.result));
      expect(results.size).toBe(1);
      expect(results.has('APPROVED')).toBe(true);

      // Exactly one hold, no matter how many deliveries arrived.
      const holds = await prisma.ledgerTransaction.count({
        where: { type: LedgerTransactionType.CARD_AUTHORIZATION },
      });
      expect(holds).toBe(1);
      expect((await ledger.getBalance(userId)).held).toBe(100_000_000n);
    });
  });

  describe('latency budget', () => {
    it('decides well inside the 3s target on a fresh account', async () => {
      await seed({ cards: 1, balanceUsdt: 10_000_000_000n, limitUsd: 10_000 });

      const samples: number[] = [];
      for (let i = 0; i < 20; i++) {
        const started = performance.now();
        const response = await asa(authorization(cardTokens[0], 100));
        samples.push(performance.now() - started);
        expect(response.body.result).toBe('APPROVED');
      }

      samples.sort((a, b) => a - b);
      const p50 = samples[Math.floor(samples.length * 0.5)];
      const p95 = samples[Math.floor(samples.length * 0.95)];

      console.log(
        `      ASA fresh account — p50 ${p50.toFixed(0)}ms  p95 ${p95.toFixed(0)}ms  max ${samples.at(-1)!.toFixed(0)}ms`,
      );

      expect(p95).toBeLessThan(3000);
    });

    /**
     * Balances are DERIVED by summing ledger entries, which is O(entries) per
     * account. That is the right correctness choice, but it means an account
     * with a long history does more work on every authorization — inside a
     * SERIALIZABLE transaction, holding the lock longer. This test exists to
     * measure that cost rather than assume it.
     */
    it('still decides inside budget for an account with a long history', async () => {
      await seed({ cards: 1, balanceUsdt: 50_000_000_000n, limitUsd: 10_000 });

      const available = await prisma.ledgerAccount.findFirstOrThrow({
        where: { userId, kind: 'USER_AVAILABLE' },
        select: { id: true },
      });
      const clearing = await prisma.ledgerAccount.findFirstOrThrow({
        where: { kind: 'SYSTEM_DEPOSIT_CLEARING' },
        select: { id: true },
      });

      // 4,000 prior entries on this account — a busy year of card activity.
      const ENTRIES = 2_000;
      const transactions = Array.from({ length: ENTRIES }, (_, i) => ({
        type: LedgerTransactionType.DEPOSIT_CONFIRMED,
        idempotencyKey: `history-${i}-${randomUUID()}`,
      }));
      await prisma.ledgerTransaction.createMany({ data: transactions });

      const created = await prisma.ledgerTransaction.findMany({
        where: { idempotencyKey: { startsWith: 'history-' } },
        select: { id: true },
      });

      await prisma.ledgerEntry.createMany({
        data: created.flatMap((transaction) => [
          {
            transactionId: transaction.id,
            accountId: clearing.id,
            direction: LedgerDirection.DEBIT,
            amount: 1_000n,
          },
          {
            transactionId: transaction.id,
            accountId: available.id,
            direction: LedgerDirection.CREDIT,
            amount: 1_000n,
          },
        ]),
      });

      const entryCount = await prisma.ledgerEntry.count({
        where: { accountId: available.id },
      });

      const samples: number[] = [];
      for (let i = 0; i < 15; i++) {
        const started = performance.now();
        const response = await asa(authorization(cardTokens[0], 100));
        samples.push(performance.now() - started);
        expect(response.body.result).toBe('APPROVED');
      }

      samples.sort((a, b) => a - b);
      const p50 = samples[Math.floor(samples.length * 0.5)];
      const p95 = samples[Math.floor(samples.length * 0.95)];

      console.log(
        `      ASA with ${entryCount} entries — p50 ${p50.toFixed(0)}ms  p95 ${p95.toFixed(0)}ms  max ${samples.at(-1)!.toFixed(0)}ms`,
      );

      expect(p95).toBeLessThan(3000);
    });
  });

  describe('fail-safe behaviour', () => {
    it('declines a frozen card', async () => {
      await seed({ cards: 1, balanceUsdt: 1_000_000_000n, limitUsd: 10_000 });
      await prisma.card.updateMany({ data: { status: CardStatus.FROZEN } });

      const response = await asa(authorization(cardTokens[0], 100));
      expect(response.body.result).toBe('CARD_PAUSED');
      expect((await ledger.getBalance(userId)).held).toBe(0n);
    });

    it('declines an unknown card rather than approving blind', async () => {
      await seed({ cards: 1, balanceUsdt: 1_000_000_000n, limitUsd: 10_000 });

      const response = await asa(authorization(randomUUID(), 100));
      expect(response.body.result).not.toBe('APPROVED');
    });

    it('rejects an unsigned request', async () => {
      await seed({ cards: 1, balanceUsdt: 1_000_000_000n, limitUsd: 10_000 });

      await request(server)
        .post('/api/webhooks/lithic/asa')
        .send(authorization(cardTokens[0], 100))
        .expect(401);
    });

    it('declines a malformed payload instead of guessing', async () => {
      await seed({ cards: 1, balanceUsdt: 1_000_000_000n, limitUsd: 10_000 });

      const response = await asa({ card_token: cardTokens[0] }); // no token, no amount
      expect(response.body.result).not.toBe('APPROVED');
      expect((await ledger.getBalance(userId)).held).toBe(0n);
    });
  });
});
