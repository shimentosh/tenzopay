import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import type { Server } from 'node:http';
import { CardTransactionStatus } from '@prisma/client';
import { PrismaService } from '../src/prisma/prisma.service';
import { LedgerService } from '../src/ledger/ledger.service';
import { cookieFrom, createTestApp, resetDatabase, VALID_KYC } from './helpers/app';

/**
 * Transaction feed pagination.
 *
 * A cursor that is returned but never applied looks fine in a single request
 * and loops forever in a client — every "next page" returns page one. These
 * tests walk the whole feed and assert that every row is seen exactly once.
 */
describe('transaction pagination', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let ledger: LedgerService;
  let server: Server;
  let cookie: string;
  let userId: string;

  const TOTAL = 27;

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp());
    ledger = app.get(LedgerService);
    server = app.getHttpServer() as Server;
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await resetDatabase(prisma);

    const registration = await request(server).post('/api/auth/register').send({
      email: 'paging@tenzopay.dev',
      password: 'CorrectHorse123',
      firstName: 'Page',
      lastName: 'Tester',
    });
    cookie = `tenzo_access=${cookieFrom(registration.headers, 'tenzo_access')}`;
    userId = registration.body.user.id;

    await request(server).post('/api/kyc/submit').set('Cookie', cookie).send(VALID_KYC);
    await ledger.creditDeposit({
      userId,
      depositId: 'paging-funding',
      amount: 10_000_000_000n,
    });

    const card = await request(server)
      .post('/api/cards')
      .set('Cookie', cookie)
      .send({ name: 'Paging', dailyLimitUsd: 5000, monthlyLimitUsd: 50000 });

    // Distinct, strictly decreasing timestamps so ordering is unambiguous.
    for (let i = 0; i < TOTAL; i++) {
      await prisma.cardTransaction.create({
        data: {
          cardId: card.body.id,
          userId,
          providerTransactionToken: `paging-txn-${i}`,
          status: CardTransactionStatus.SETTLED,
          amount: BigInt(1000 + i),
          settledAmount: BigInt(1000 + i),
          currency: 'USD',
          merchantName: `Merchant ${String(i).padStart(2, '0')}`,
          createdAt: new Date(Date.now() - i * 60_000),
          settledAt: new Date(Date.now() - i * 60_000),
        },
      });
    }
  });

  it('walks every page without repeating or skipping a row', async () => {
    const seen: string[] = [];
    let cursor: string | null = null;
    let pages = 0;

    do {
      const params = new URLSearchParams({ type: 'card', limit: '10' });
      if (cursor) params.set('cursor', cursor);

      const response = await request(server)
        .get(`/api/transactions?${params}`)
        .set('Cookie', cookie)
        .expect(200);

      seen.push(...response.body.data.map((row: { id: string }) => row.id));
      cursor = response.body.nextCursor;
      pages++;

      // Guard against the exact bug this file exists for: an unapplied cursor
      // returns page one forever.
      expect(pages).toBeLessThan(12);
    } while (cursor);

    expect(seen).toHaveLength(TOTAL);
    expect(new Set(seen).size).toBe(TOTAL);
    expect(pages).toBe(3); // 10 + 10 + 7
  });

  it('returns rows newest-first and strictly descending across pages', async () => {
    const timestamps: string[] = [];
    let cursor: string | null = null;

    do {
      const params = new URLSearchParams({ type: 'card', limit: '7' });
      if (cursor) params.set('cursor', cursor);

      const response = await request(server)
        .get(`/api/transactions?${params}`)
        .set('Cookie', cookie);

      timestamps.push(
        ...response.body.data.map((row: { createdAt: string }) => row.createdAt),
      );
      cursor = response.body.nextCursor;
    } while (cursor);

    const sorted = [...timestamps].sort().reverse();
    expect(timestamps).toEqual(sorted);
  });

  it('reports hasMore honestly and stops offering a cursor on the last page', async () => {
    const first = await request(server)
      .get('/api/transactions?type=card&limit=10')
      .set('Cookie', cookie);

    expect(first.body.hasMore).toBe(true);
    expect(first.body.nextCursor).toBeTruthy();

    const all = await request(server)
      .get('/api/transactions?type=card&limit=100')
      .set('Cookie', cookie);

    expect(all.body.data).toHaveLength(TOTAL);
    expect(all.body.hasMore).toBe(false);
    // A cursor on the final page makes clients fetch an empty page.
    expect(all.body.nextCursor).toBeNull();
  });

  it('caps the page size so a client cannot request the whole history', async () => {
    await request(server)
      .get('/api/transactions?limit=100000')
      .set('Cookie', cookie)
      .expect(400);
  });

  it('keeps filters applied while paging', async () => {
    const response = await request(server)
      .get('/api/transactions?type=deposits&limit=10')
      .set('Cookie', cookie)
      .expect(200);

    // Card transactions must not leak into a deposits-only page.
    for (const row of response.body.data) {
      expect(row.kind).toBe('DEPOSIT');
    }
  });
});
