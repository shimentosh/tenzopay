import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import type { Server } from 'node:http';
import { UserStatus } from '@prisma/client';
import { PrismaService } from '../src/prisma/prisma.service';
import { cookieFrom, createTestApp, resetDatabase } from './helpers/app';

describe('authentication', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let server: Server;

  const credentials = {
    email: 'auth-test@tenzopay.dev',
    password: 'CorrectHorse123',
    firstName: 'Auth',
    lastName: 'Tester',
  };

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp());
    server = app.getHttpServer() as Server;
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await resetDatabase(prisma);
  });

  describe('registration validation', () => {
    it('creates an account and sets httpOnly session cookies', async () => {
      const response = await request(server)
        .post('/api/auth/register')
        .send(credentials)
        .expect(201);

      expect(response.body.user.email).toBe(credentials.email);
      // The password must never come back, hashed or otherwise.
      expect(JSON.stringify(response.body)).not.toContain(credentials.password);
      expect(response.body.user).not.toHaveProperty('passwordHash');

      const cookies = response.headers['set-cookie'] as unknown as string[];
      expect(cookies.join(';')).toContain('HttpOnly');
      expect(cookieFrom(response.headers, 'tenzo_access')).toBeTruthy();
      expect(cookieFrom(response.headers, 'tenzo_refresh')).toBeTruthy();
    });

    it.each([
      ['short password', { password: 'Short1' }],
      ['no uppercase', { password: 'alllowercase123' }],
      ['no lowercase', { password: 'ALLUPPERCASE123' }],
      ['no digit', { password: 'NoDigitsHereAtAll' }],
      ['invalid email', { email: 'not-an-email' }],
      ['empty first name', { firstName: '' }],
    ])('rejects %s', async (_label, override) => {
      const response = await request(server)
        .post('/api/auth/register')
        .send({ ...credentials, ...override })
        .expect(400);

      expect(response.body.code).toBe('VALIDATION_ERROR');
      expect(response.body.details).toBeDefined();
    });

    it('normalises the email to lowercase', async () => {
      await request(server)
        .post('/api/auth/register')
        .send({ ...credentials, email: 'MiXeD@TenzoPay.DEV' })
        .expect(201);

      const user = await prisma.user.findUnique({
        where: { email: 'mixed@tenzopay.dev' },
      });
      expect(user).not.toBeNull();
    });

    it('does not reveal that an email is already registered', async () => {
      await request(server).post('/api/auth/register').send(credentials).expect(201);

      const response = await request(server)
        .post('/api/auth/register')
        .send(credentials)
        .expect(409);

      // Deliberately vague: this endpoint must not be an enumeration oracle.
      expect(response.body.message).not.toMatch(/already (exists|registered)/i);
      expect(response.body.message).toMatch(/cannot be registered/i);
    });

    it('provisions a wallet and ledger accounts on registration', async () => {
      const response = await request(server)
        .post('/api/auth/register')
        .send(credentials)
        .expect(201);

      const userId = response.body.user.id as string;

      expect(await prisma.wallet.count({ where: { userId } })).toBe(1);
      expect(await prisma.ledgerAccount.count({ where: { userId } })).toBe(2);
    });
  });

  describe('login', () => {
    beforeEach(async () => {
      await request(server).post('/api/auth/register').send(credentials);
    });

    it('signs in with correct credentials', async () => {
      const response = await request(server)
        .post('/api/auth/login')
        .send({ email: credentials.email, password: credentials.password })
        .expect(200);

      expect(response.body.user.email).toBe(credentials.email);
      expect(cookieFrom(response.headers, 'tenzo_access')).toBeTruthy();
    });

    it('gives an identical message for a wrong password and an unknown email', async () => {
      const wrongPassword = await request(server)
        .post('/api/auth/login')
        .send({ email: credentials.email, password: 'WrongPassword123' })
        .expect(401);

      const unknownEmail = await request(server)
        .post('/api/auth/login')
        .send({ email: 'nobody@tenzopay.dev', password: credentials.password })
        .expect(401);

      expect(wrongPassword.body.message).toBe(unknownEmail.body.message);
    });

    it('refuses a frozen account', async () => {
      await prisma.user.updateMany({
        where: { email: credentials.email },
        data: { status: UserStatus.FROZEN },
      });

      const response = await request(server)
        .post('/api/auth/login')
        .send({ email: credentials.email, password: credentials.password })
        .expect(403);

      expect(response.body.code).toBe('FORBIDDEN');
    });
  });

  describe('session handling', () => {
    let accessCookie: string;
    let refreshCookie: string;

    beforeEach(async () => {
      const response = await request(server)
        .post('/api/auth/register')
        .send(credentials);

      accessCookie = cookieFrom(response.headers, 'tenzo_access')!;
      refreshCookie = cookieFrom(response.headers, 'tenzo_refresh')!;
    });

    it('rejects protected routes without a session', async () => {
      await request(server).get('/api/auth/me').expect(401);
      await request(server).get('/api/overview').expect(401);
      await request(server).get('/api/cards').expect(401);
    });

    it('accepts a valid session', async () => {
      const response = await request(server)
        .get('/api/auth/me')
        .set('Cookie', `tenzo_access=${accessCookie}`)
        .expect(200);

      expect(response.body.email).toBe(credentials.email);
      expect(response.body).not.toHaveProperty('passwordHash');
    });

    it('rejects a tampered token', async () => {
      await request(server)
        .get('/api/auth/me')
        .set('Cookie', `tenzo_access=${accessCookie.slice(0, -6)}AAAAAA`)
        .expect(401);
    });

    it('rotates the refresh token on use', async () => {
      const response = await request(server)
        .post('/api/auth/refresh')
        .set('Cookie', `tenzo_refresh=${refreshCookie}`)
        .expect(200);

      const rotated = cookieFrom(response.headers, 'tenzo_refresh');
      expect(rotated).toBeTruthy();
      expect(rotated).not.toBe(refreshCookie);
    });

    it('revokes the whole family when a consumed refresh token is replayed', async () => {
      // First use rotates it.
      const rotatedResponse = await request(server)
        .post('/api/auth/refresh')
        .set('Cookie', `tenzo_refresh=${refreshCookie}`)
        .expect(200);

      const rotated = cookieFrom(rotatedResponse.headers, 'tenzo_refresh')!;

      // Replaying the original is the signature of a stolen token.
      await request(server)
        .post('/api/auth/refresh')
        .set('Cookie', `tenzo_refresh=${refreshCookie}`)
        .expect(401);

      // The legitimate rotated token must also be dead now.
      await request(server)
        .post('/api/auth/refresh')
        .set('Cookie', `tenzo_refresh=${rotated}`)
        .expect(401);

      const active = await prisma.session.count({ where: { revokedAt: null } });
      expect(active).toBe(0);
    });

    it('stores only a hash of the refresh token', async () => {
      const sessions = await prisma.session.findMany({
        select: { refreshTokenHash: true },
      });

      for (const session of sessions) {
        expect(session.refreshTokenHash).not.toBe(refreshCookie);
        expect(session.refreshTokenHash).toHaveLength(64); // sha256 hex
      }
    });

    it('clears cookies on logout', async () => {
      const response = await request(server)
        .post('/api/auth/logout')
        .set('Cookie', `tenzo_refresh=${refreshCookie}`)
        .expect(200);

      const cleared = (response.headers['set-cookie'] as unknown as string[]).join(';');
      expect(cleared).toContain('tenzo_access=;');
    });

    it('revokes every session on logout-all', async () => {
      await request(server)
        .post('/api/auth/logout-all')
        .set('Cookie', `tenzo_access=${accessCookie}`)
        .expect(200);

      expect(await prisma.session.count({ where: { revokedAt: null } })).toBe(0);
    });
  });

  describe('password reset', () => {
    beforeEach(async () => {
      await request(server).post('/api/auth/register').send(credentials);
    });

    it('responds identically for known and unknown emails', async () => {
      const known = await request(server)
        .post('/api/auth/forgot-password')
        .send({ email: credentials.email })
        .expect(200);

      const unknown = await request(server)
        .post('/api/auth/forgot-password')
        .send({ email: 'nobody@tenzopay.dev' })
        .expect(200);

      expect(known.body.ok).toBe(true);
      expect(unknown.body.ok).toBe(true);
    });

    it('resets the password and revokes existing sessions', async () => {
      const forgot = await request(server)
        .post('/api/auth/forgot-password')
        .send({ email: credentials.email });

      const token = forgot.body.resetToken as string;
      expect(token).toBeTruthy();

      await request(server)
        .post('/api/auth/reset-password')
        .send({ token, password: 'BrandNewPassword456' })
        .expect(200);

      // Old password no longer works.
      await request(server)
        .post('/api/auth/login')
        .send({ email: credentials.email, password: credentials.password })
        .expect(401);

      await request(server)
        .post('/api/auth/login')
        .send({ email: credentials.email, password: 'BrandNewPassword456' })
        .expect(200);
    });

    it('rejects an invalid reset token', async () => {
      await request(server)
        .post('/api/auth/reset-password')
        .send({ token: 'totally-made-up-token', password: 'BrandNewPassword456' })
        .expect(400);
    });
  });
});
