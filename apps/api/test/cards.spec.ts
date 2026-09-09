import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import type { Server } from 'node:http';
import { CardStatus } from '@prisma/client';
import { PrismaService } from '../src/prisma/prisma.service';
import { LedgerService } from '../src/ledger/ledger.service';
import { cookieFrom, createTestApp, resetDatabase, VALID_KYC } from './helpers/app';

/**
 * Card lifecycle over HTTP.
 *
 * Runs against the mock card provider, which deliberately mirrors Lithic's
 * real behaviour in the two places it matters: card states are OPEN/PAUSED/
 * CLOSED, and a new velocity rule is created SHADOWING and only enforces once
 * promoted.
 */
describe('cards', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let ledger: LedgerService;
  let server: Server;
  let cookie: string;
  let userId: string;

  const credentials = {
    email: 'cards-test@tenzopay.dev',
    password: 'CorrectHorse123',
    firstName: 'Card',
    lastName: 'Tester',
  };

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

    const registration = await request(server)
      .post('/api/auth/register')
      .send(credentials);

    cookie = `tenzo_access=${cookieFrom(registration.headers, 'tenzo_access')}`;
    userId = registration.body.user.id;
  });

  async function completeKyc() {
    await request(server).post('/api/kyc/submit').set('Cookie', cookie).send(VALID_KYC);
  }

  const validCard = {
    name: 'Marketing',
    perTransactionLimitUsd: 250,
    dailyLimitUsd: 500,
    monthlyLimitUsd: 5000,
  };

  describe('KYC gating', () => {
    it('refuses card creation before verification', async () => {
      const response = await request(server)
        .post('/api/cards')
        .set('Cookie', cookie)
        .send(validCard)
        .expect(403);

      expect(response.body.code).toBe('KYC_REQUIRED');
      expect(await prisma.card.count()).toBe(0);
    });

    it('refuses a deposit address before verification', async () => {
      await request(server)
        .get('/api/deposits/address')
        .set('Cookie', cookie)
        .expect(403);
    });
  });

  describe('creation', () => {
    beforeEach(completeKyc);

    it('issues a card and converts dollar limits to cents', async () => {
      const response = await request(server)
        .post('/api/cards')
        .set('Cookie', cookie)
        .send(validCard)
        .expect(201);

      expect(response.body.name).toBe('Marketing');
      expect(response.body.status).toBe('ACTIVE');
      expect(response.body.lastFour).toHaveLength(4);

      // Dollars in, cents stored.
      expect(response.body.dailyLimit).toBe('50000');
      expect(response.body.monthlyLimit).toBe('500000');
      expect(response.body.perTransactionLimit).toBe('25000');
    });

    it('never exposes a full card number', async () => {
      const response = await request(server)
        .post('/api/cards')
        .set('Cookie', cookie)
        .send(validCard)
        .expect(201);

      const body = JSON.stringify(response.body);
      expect(body).not.toMatch(/"pan"/i);
      expect(body).not.toMatch(/"cvv"/i);
      // Nothing that looks like a 13-19 digit card number.
      expect(body).not.toMatch(/\b\d{13,19}\b/);

      const stored = await prisma.card.findFirstOrThrow();
      expect(Object.keys(stored)).not.toContain('pan');
      expect(stored.lastFour).toHaveLength(4);
    });

    it('creates velocity rules and PROMOTES them to ACTIVE', async () => {
      const response = await request(server)
        .post('/api/cards')
        .set('Cookie', cookie)
        .send(validCard)
        .expect(201);

      const detail = await request(server)
        .get(`/api/cards/${response.body.id}`)
        .set('Cookie', cookie)
        .expect(200);

      // A rule left in SHADOWING enforces nothing — this is the regression
      // guard for forgetting the promote step.
      expect(detail.body.rules).toHaveLength(2);
      for (const rule of detail.body.rules) {
        expect(rule.state).toBe('ACTIVE');
      }
      expect(detail.body.rules.map((r: { period: string }) => r.period).sort()).toEqual([
        'DAY',
        'MONTH',
      ]);
    });

    it('advertises only controls a virtual card really supports', async () => {
      const created = await request(server)
        .post('/api/cards')
        .set('Cookie', cookie)
        .send(validCard);

      const detail = await request(server)
        .get(`/api/cards/${created.body.id}`)
        .set('Cookie', cookie);

      expect(detail.body.supportedControls.freeze).toBe(true);
      expect(detail.body.supportedControls.online).toBe(true);
      // A virtual card cannot be tapped or used at an ATM.
      expect(detail.body.supportedControls.contactless).toBe(false);
      expect(detail.body.supportedControls.atm).toBe(false);
    });

    it.each([
      ['no limits at all', { name: 'X' }],
      ['empty name', { ...validCard, name: '' }],
      ['daily above monthly', { name: 'X', dailyLimitUsd: 5000, monthlyLimitUsd: 100 }],
      [
        'per-transaction above daily',
        { name: 'X', perTransactionLimitUsd: 900, dailyLimitUsd: 100, monthlyLimitUsd: 5000 },
      ],
      ['negative limit', { name: 'X', dailyLimitUsd: -5 }],
      ['fractional limit', { name: 'X', dailyLimitUsd: 10.5 }],
    ])('rejects %s', async (_label, payload) => {
      const response = await request(server)
        .post('/api/cards')
        .set('Cookie', cookie)
        .send(payload)
        .expect(400);

      expect(response.body.code).toBe('VALIDATION_ERROR');
      expect(await prisma.card.count()).toBe(0);
    });
  });

  describe('plan limits', () => {
    beforeEach(async () => {
      await completeKyc();
    });

    afterEach(async () => {
      await prisma.setting.deleteMany();
    });

    it('stops a Starter account at its plan ceiling', async () => {
      await prisma.setting.create({ data: { key: 'limits.cards.starter', value: '1' } });

      const first = await request(server)
        .post('/api/cards')
        .set('Cookie', cookie)
        .send({ ...validCard, name: 'First' });
      expect(first.status).toBe(201);

      const second = await request(server)
        .post('/api/cards')
        .set('Cookie', cookie)
        .send({ ...validCard, name: 'Second' });

      expect(second.status).toBe(400);
      expect(second.body.message).toMatch(/plan allows 1 open cards/i);
    });

    it('lets the same account through once it is on a larger plan', async () => {
      await prisma.setting.create({ data: { key: 'limits.cards.starter', value: '1' } });
      await prisma.setting.create({ data: { key: 'limits.cards.team', value: '5' } });

      await request(server)
        .post('/api/cards')
        .set('Cookie', cookie)
        .send({ ...validCard, name: 'First' });

      await prisma.user.update({ where: { id: userId }, data: { plan: 'TEAM' } });

      const second = await request(server)
        .post('/api/cards')
        .set('Cookie', cookie)
        .send({ ...validCard, name: 'Second' });

      expect(second.status).toBe(201);
    });

    it('treats zero as no limit, which is how Business is sold', async () => {
      await prisma.setting.create({ data: { key: 'limits.cards.business', value: '0' } });
      await prisma.user.update({ where: { id: userId }, data: { plan: 'BUSINESS' } });

      for (const name of ['One', 'Two', 'Three']) {
        const response = await request(server)
          .post('/api/cards')
          .set('Cookie', cookie)
          .send({ ...validCard, name });
        expect(response.status).toBe(201);
      }
    });
  });

  describe('state transitions', () => {
    let cardId: string;

    beforeEach(async () => {
      await completeKyc();
      const created = await request(server)
        .post('/api/cards')
        .set('Cookie', cookie)
        .send(validCard);
      cardId = created.body.id;
    });

    it('freezes and unfreezes', async () => {
      const frozen = await request(server)
        .patch(`/api/cards/${cardId}/status`)
        .set('Cookie', cookie)
        .send({ action: 'freeze' })
        .expect(200);
      expect(frozen.body.status).toBe('FROZEN');

      const active = await request(server)
        .patch(`/api/cards/${cardId}/status`)
        .set('Cookie', cookie)
        .send({ action: 'unfreeze' })
        .expect(200);
      expect(active.body.status).toBe('ACTIVE');
    });

    it('refuses to unfreeze a card that is not frozen', async () => {
      await request(server)
        .patch(`/api/cards/${cardId}/status`)
        .set('Cookie', cookie)
        .send({ action: 'unfreeze' })
        .expect(400);
    });

    it('closes permanently — a closed card cannot be reopened', async () => {
      await request(server)
        .patch(`/api/cards/${cardId}/status`)
        .set('Cookie', cookie)
        .send({ action: 'close' })
        .expect(200);

      for (const action of ['unfreeze', 'freeze', 'close']) {
        await request(server)
          .patch(`/api/cards/${cardId}/status`)
          .set('Cookie', cookie)
          .send({ action })
          .expect(400);
      }

      const stored = await prisma.card.findUniqueOrThrow({ where: { id: cardId } });
      expect(stored.status).toBe(CardStatus.CLOSED);
      expect(stored.closedAt).not.toBeNull();
    });

    it('rejects an unknown action', async () => {
      await request(server)
        .patch(`/api/cards/${cardId}/status`)
        .set('Cookie', cookie)
        .send({ action: 'incinerate' })
        .expect(400);
    });
  });

  describe('limits', () => {
    let cardId: string;

    beforeEach(async () => {
      await completeKyc();
      const created = await request(server)
        .post('/api/cards')
        .set('Cookie', cookie)
        .send(validCard);
      cardId = created.body.id;
    });

    it('updates limits and replaces the provider rules', async () => {
      const response = await request(server)
        .patch(`/api/cards/${cardId}/limits`)
        .set('Cookie', cookie)
        .send({ dailyLimitUsd: 1000, monthlyLimitUsd: 9000 })
        .expect(200);

      expect(response.body.dailyLimit).toBe('100000');
      expect(response.body.monthlyLimit).toBe('900000');

      const detail = await request(server)
        .get(`/api/cards/${cardId}`)
        .set('Cookie', cookie);

      // Replaced, not duplicated — and promoted again.
      expect(detail.body.rules).toHaveLength(2);
      for (const rule of detail.body.rules) {
        expect(rule.state).toBe('ACTIVE');
      }
    });

    it('refuses a daily limit above the monthly limit', async () => {
      await request(server)
        .patch(`/api/cards/${cardId}/limits`)
        .set('Cookie', cookie)
        .send({ dailyLimitUsd: 9000, monthlyLimitUsd: 100 })
        .expect(400);
    });
  });

  describe('ownership', () => {
    it("refuses access to another user's card", async () => {
      await completeKyc();
      const created = await request(server)
        .post('/api/cards')
        .set('Cookie', cookie)
        .send(validCard);
      const cardId = created.body.id;

      const intruder = await request(server).post('/api/auth/register').send({
        email: 'intruder@tenzopay.dev',
        password: 'CorrectHorse123',
        firstName: 'In',
        lastName: 'Truder',
      });
      const intruderCookie = `tenzo_access=${cookieFrom(intruder.headers, 'tenzo_access')}`;

      await request(server)
        .post('/api/kyc/submit')
        .set('Cookie', intruderCookie)
        .send(VALID_KYC);

      // Not 403: the card must not be acknowledged as existing at all.
      await request(server)
        .get(`/api/cards/${cardId}`)
        .set('Cookie', intruderCookie)
        .expect(404);

      await request(server)
        .patch(`/api/cards/${cardId}/status`)
        .set('Cookie', intruderCookie)
        .send({ action: 'freeze' })
        .expect(404);

      const list = await request(server).get('/api/cards').set('Cookie', intruderCookie);
      expect(list.body).toHaveLength(0);
    });
  });

  describe('overview', () => {
    it('reports the derived balance and card counts', async () => {
      await completeKyc();
      await ledger.creditDeposit({
        userId,
        depositId: 'overview-test',
        amount: 1_000_000_000n,
      });

      await request(server).post('/api/cards').set('Cookie', cookie).send(validCard);
      const second = await request(server)
        .post('/api/cards')
        .set('Cookie', cookie)
        .send({ ...validCard, name: 'Travel' });

      await request(server)
        .patch(`/api/cards/${second.body.id}/status`)
        .set('Cookie', cookie)
        .send({ action: 'freeze' });

      const overview = await request(server)
        .get('/api/overview')
        .set('Cookie', cookie)
        .expect(200);

      expect(overview.body.balance.available).toBe('1000000000');
      expect(overview.body.activeCards).toBe(1);
      expect(overview.body.frozenCards).toBe(1);
    });
  });
});
