import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import type { Server } from 'node:http';
import { AdminRole } from '@prisma/client';
import { PrismaService } from '../src/prisma/prisma.service';
import { LedgerService } from '../src/ledger/ledger.service';
import { cookieFrom, createAdmin, createTestApp, resetDatabase } from './helpers/app';

/**
 * Admin authentication and the RBAC matrix.
 *
 * The single most important assertion in this file: SUPPORT can never post a
 * ledger adjustment. Support staff are the largest, least-vetted group with
 * console access, and an adjustment moves customer money.
 */
describe('admin RBAC', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let ledger: LedgerService;
  let server: Server;
  let targetUserId: string;

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

    const user = await prisma.user.create({
      data: { email: 'target@tenzopay.dev', passwordHash: 'x', wallet: { create: {} } },
      select: { id: true },
    });
    targetUserId = user.id;
    await ledger.ensureUserAccounts(targetUserId);
    await ledger.creditDeposit({
      userId: targetUserId,
      depositId: 'rbac-funding',
      amount: 1_000_000_000n,
    });
  });

  async function signIn(role: AdminRole): Promise<string> {
    const admin = await createAdmin(prisma, role);
    const response = await request(server)
      .post('/api/auth/admin/login')
      .send({ email: admin.email, password: admin.password })
      .expect(200);

    return `tenzo_admin_access=${cookieFrom(response.headers, 'tenzo_admin_access')}`;
  }

  describe('admin authentication', () => {
    it('signs in and reports the role', async () => {
      const cookie = await signIn(AdminRole.ADMIN);

      const me = await request(server)
        .get('/api/admin/me')
        .set('Cookie', cookie)
        .expect(200);

      expect(me.body.role).toBe('ADMIN');
    });

    it('rejects the console without a session', async () => {
      await request(server).get('/api/admin/dashboard').expect(401);
      await request(server).get('/api/admin/users').expect(401);
    });

    it('rejects a CUSTOMER token on admin routes', async () => {
      const registration = await request(server).post('/api/auth/register').send({
        email: 'customer@tenzopay.dev',
        password: 'CorrectHorse123',
        firstName: 'Cust',
        lastName: 'Omer',
      });

      const userCookie = `tenzo_admin_access=${cookieFrom(registration.headers, 'tenzo_access')}`;

      // A user token carries type:"user"; the admin guard requires type:"admin".
      await request(server)
        .get('/api/admin/dashboard')
        .set('Cookie', userCookie)
        .expect(401);
    });

    it('rejects a deactivated admin', async () => {
      const admin = await createAdmin(prisma, AdminRole.ADMIN);
      await prisma.adminUser.update({
        where: { id: admin.id },
        data: { isActive: false },
      });

      await request(server)
        .post('/api/auth/admin/login')
        .send({ email: admin.email, password: admin.password })
        .expect(401);
    });

    it('records an audit entry on sign-in', async () => {
      await signIn(AdminRole.ADMIN);

      const logs = await prisma.auditLog.findMany({ where: { action: 'ADMIN_LOGIN' } });
      expect(logs).toHaveLength(1);
    });
  });

  describe('read access — every role may look', () => {
    it.each([
      AdminRole.SUPPORT,
      AdminRole.RISK,
      AdminRole.FINANCE,
      AdminRole.ADMIN,
      AdminRole.SUPER_ADMIN,
    ])('%s can read the dashboard and users', async (role) => {
      const cookie = await signIn(role);

      await request(server).get('/api/admin/dashboard').set('Cookie', cookie).expect(200);
      await request(server).get('/api/admin/users').set('Cookie', cookie).expect(200);
      await request(server).get('/api/admin/cards').set('Cookie', cookie).expect(200);
      await request(server).get('/api/admin/audit').set('Cookie', cookie).expect(200);
    });
  });

  describe('ledger adjustments — FINANCE and SUPER_ADMIN only', () => {
    const adjustment = (userId: string) => ({
      userId,
      amount: '25.00',
      reason: 'goodwill credit for support ticket 1234',
    });

    it.each([
      [AdminRole.SUPPORT, 403],
      [AdminRole.RISK, 403],
      [AdminRole.ADMIN, 403],
      [AdminRole.FINANCE, 201],
      [AdminRole.SUPER_ADMIN, 201],
    ])('%s -> %i', async (role, expected) => {
      const cookie = await signIn(role);

      await request(server)
        .post('/api/admin/ledger/adjust')
        .set('Cookie', cookie)
        .send(adjustment(targetUserId))
        .expect(expected);
    });

    it('posts balanced entries and an audit trail when permitted', async () => {
      const cookie = await signIn(AdminRole.FINANCE);

      const before = await ledger.getBalance(targetUserId);

      await request(server)
        .post('/api/admin/ledger/adjust')
        .set('Cookie', cookie)
        .send(adjustment(targetUserId))
        .expect(201);

      const after = await ledger.getBalance(targetUserId);
      expect(after.available - before.available).toBe(25_000_000n);

      const entries = await prisma.ledgerEntry.findMany({
        where: { transaction: { type: 'ADMIN_ADJUSTMENT' } },
      });
      expect(entries).toHaveLength(2);

      const action = await prisma.adminAction.findFirstOrThrow({
        where: { type: 'LEDGER_ADJUSTMENT' },
      });
      expect(action.reason).toContain('goodwill credit');

      const audit = await prisma.auditLog.findFirst({
        where: { action: 'LEDGER_ADJUSTMENT' },
      });
      expect(audit).not.toBeNull();

      // The invariant must still hold after an operator touches the ledger.
      expect((await ledger.verifyIntegrity()).ok).toBe(true);
    });

    it('requires a substantive reason', async () => {
      const cookie = await signIn(AdminRole.FINANCE);

      await request(server)
        .post('/api/admin/ledger/adjust')
        .set('Cookie', cookie)
        .send({ userId: targetUserId, amount: '25.00', reason: 'oops' })
        .expect(400);

      expect(await prisma.adminAction.count()).toBe(0);
    });

    it('refuses a debit that would overdraw the customer', async () => {
      const cookie = await signIn(AdminRole.FINANCE);

      await request(server)
        .post('/api/admin/ledger/adjust')
        .set('Cookie', cookie)
        .send({
          userId: targetUserId,
          amount: '-99999.00',
          reason: 'attempted overdraw during testing',
        })
        .expect(422);

      expect((await ledger.getBalance(targetUserId)).available).toBe(1_000_000_000n);
    });

    it('has no endpoint that sets a balance directly', async () => {
      const cookie = await signIn(AdminRole.SUPER_ADMIN);

      // Even the highest role cannot assign a balance; only signed deltas exist.
      for (const path of ['/api/admin/ledger/set', '/api/admin/users/balance']) {
        await request(server)
          .post(path)
          .set('Cookie', cookie)
          .send({ userId: targetUserId, balance: '1000000' })
          .expect(404);
      }
    });
  });

  describe('account freezing — ADMIN and RISK only', () => {
    it.each([
      [AdminRole.SUPPORT, 403],
      [AdminRole.FINANCE, 403],
      [AdminRole.RISK, 201],
      [AdminRole.ADMIN, 201],
      [AdminRole.SUPER_ADMIN, 201],
    ])('%s -> %i', async (role, expected) => {
      const cookie = await signIn(role);

      await request(server)
        .post(`/api/admin/users/${targetUserId}/status`)
        .set('Cookie', cookie)
        .send({ status: 'FROZEN', reason: 'suspicious activity under review' })
        .expect(expected);
    });

    it('revokes the customer sessions it freezes', async () => {
      const registration = await request(server).post('/api/auth/register').send({
        email: 'freeze-me@tenzopay.dev',
        password: 'CorrectHorse123',
        firstName: 'Freeze',
        lastName: 'Me',
      });
      const victimId = registration.body.user.id;
      const victimCookie = `tenzo_access=${cookieFrom(registration.headers, 'tenzo_access')}`;

      await request(server).get('/api/auth/me').set('Cookie', victimCookie).expect(200);

      const cookie = await signIn(AdminRole.RISK);
      await request(server)
        .post(`/api/admin/users/${victimId}/status`)
        .set('Cookie', cookie)
        .send({ status: 'FROZEN', reason: 'suspicious activity under review' })
        .expect(201);

      // A frozen account must lose access immediately, not when its JWT expires.
      await request(server).get('/api/auth/me').set('Cookie', victimCookie).expect(403);
      expect(
        await prisma.session.count({ where: { userId: victimId, revokedAt: null } }),
      ).toBe(0);
    });
  });

  describe('webhook replay — ADMIN only', () => {
    it.each([
      [AdminRole.SUPPORT, 403],
      [AdminRole.FINANCE, 403],
      [AdminRole.RISK, 403],
    ])('%s is denied', async (role, expected) => {
      const cookie = await signIn(role);

      await request(server)
        .post('/api/admin/webhooks/00000000-0000-0000-0000-000000000000/replay')
        .set('Cookie', cookie)
        .send({ reason: 'retrying a failed delivery' })
        .expect(expected);
    });
  });

  describe('card freezing — ADMIN and RISK only', () => {
    it.each([
      [AdminRole.SUPPORT, 403],
      [AdminRole.FINANCE, 403],
    ])('%s is denied', async (role, expected) => {
      const cookie = await signIn(role);

      await request(server)
        .post('/api/admin/cards/00000000-0000-0000-0000-000000000000/freeze')
        .set('Cookie', cookie)
        .send({ reason: 'card reported compromised' })
        .expect(expected);
    });
  });

  describe('PAN exposure', () => {
    it('never returns a full card number to staff', async () => {
      const registration = await request(server).post('/api/auth/register').send({
        email: 'cardholder@tenzopay.dev',
        password: 'CorrectHorse123',
        firstName: 'Card',
        lastName: 'Holder',
      });
      const userCookie = `tenzo_access=${cookieFrom(registration.headers, 'tenzo_access')}`;

      await request(server).post('/api/kyc/submit').set('Cookie', userCookie).send({
        firstName: 'Card',
        lastName: 'Holder',
        dob: '1990-01-01',
        email: 'cardholder@example.com',
        phoneNumber: '+15555550143',
        governmentId: '111-23-1234',
        address1: '1 Main St',
        city: 'Austin',
        state: 'TX',
        postalCode: '78701',
        country: 'USA',
      });

      await request(server)
        .post('/api/cards')
        .set('Cookie', userCookie)
        .send({ name: 'Ops', dailyLimitUsd: 100, monthlyLimitUsd: 1000 });

      const cookie = await signIn(AdminRole.SUPER_ADMIN);
      const cards = await request(server)
        .get('/api/admin/cards')
        .set('Cookie', cookie)
        .expect(200);

      const body = JSON.stringify(cards.body);
      expect(body).not.toMatch(/"pan"/i);
      expect(body).not.toMatch(/"cvv"/i);
      expect(body).not.toMatch(/\b\d{13,19}\b/);
      expect(cards.body.data[0].lastFour).toHaveLength(4);
    });
  });

  describe('staff switcher exposure', () => {
    /**
     * The customer portal shows a "Console" link when the signed-in customer's
     * email also has an active console account. It must never appear for
     * anyone else, and it must never carry anything but a URL — it is a
     * navigation hint, not a capability.
     */
    async function registerCustomer(email: string) {
      const response = await request(server).post('/api/auth/register').send({
        email,
        password: 'CorrectHorse123',
        firstName: 'Switch',
        lastName: 'Tester',
      });
      return `tenzo_access=${cookieFrom(response.headers, 'tenzo_access')}`;
    }

    it('is absent for an ordinary customer', async () => {
      const userCookie = await registerCustomer('ordinary@tenzopay.dev');

      const me = await request(server)
        .get('/api/auth/me')
        .set('Cookie', userCookie)
        .expect(200);

      expect(me.body.staffAccess).toBeNull();
    });

    it('appears when the same email holds an active console account', async () => {
      const email = 'dual@tenzopay.dev';
      await prisma.adminUser.create({
        data: {
          email,
          name: 'Dual Role',
          role: AdminRole.SUPPORT,
          passwordHash: 'unused-for-this-test',
        },
      });

      const userCookie = await registerCustomer(email);

      const me = await request(server)
        .get('/api/auth/me')
        .set('Cookie', userCookie)
        .expect(200);

      expect(me.body.staffAccess).toMatchObject({ role: 'SUPPORT' });
      expect(me.body.staffAccess.consoleUrl).toMatch(/^https?:\/\//);
      // A URL and a role label — nothing that could act as a credential.
      expect(Object.keys(me.body.staffAccess).sort()).toEqual(['consoleUrl', 'role']);
    });

    it('disappears once the console account is deactivated', async () => {
      const email = 'revoked@tenzopay.dev';
      const admin = await prisma.adminUser.create({
        data: {
          email,
          name: 'Revoked',
          role: AdminRole.ADMIN,
          passwordHash: 'unused-for-this-test',
        },
      });

      const userCookie = await registerCustomer(email);
      await prisma.adminUser.update({
        where: { id: admin.id },
        data: { isActive: false },
      });

      const me = await request(server)
        .get('/api/auth/me')
        .set('Cookie', userCookie)
        .expect(200);

      expect(me.body.staffAccess).toBeNull();
    });

    it('grants no console access on its own', async () => {
      const email = 'hint-only@tenzopay.dev';
      await prisma.adminUser.create({
        data: {
          email,
          name: 'Hint Only',
          role: AdminRole.SUPER_ADMIN,
          passwordHash: 'unused-for-this-test',
        },
      });

      const userCookie = await registerCustomer(email);

      // Holding a customer session for a staff email must not open the console.
      await request(server)
        .get('/api/admin/dashboard')
        .set('Cookie', userCookie)
        .expect(401);
    });
  });
});
