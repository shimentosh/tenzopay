import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import type { Server } from 'node:http';
import { PrismaService } from '../src/prisma/prisma.service';
import { createTestApp, resetDatabase } from './helpers/app';

/**
 * Rate limiting, with the real guard enabled.
 *
 * Every other suite disables throttling so it can exercise endpoints
 * exhaustively; this one exists so that convenience never hides a regression in
 * the protection itself. Login and registration are the endpoints an attacker
 * actually hammers.
 */
describe('rate limiting', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let server: Server;

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp({ throttle: true }));
    server = app.getHttpServer() as Server;
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await resetDatabase(prisma);
  });

  it('throttles repeated login attempts', async () => {
    const attempt = () =>
      request(server)
        .post('/api/auth/login')
        .send({ email: 'nobody@tenzopay.dev', password: 'WrongPassword123' });

    const statuses: number[] = [];
    for (let i = 0; i < 15; i++) {
      const response = await attempt();
      statuses.push(response.status);
    }

    // The limit is 10/minute, so a brute-force run must hit 429 well before 15.
    expect(statuses).toContain(429);
    expect(statuses.filter((s) => s === 429).length).toBeGreaterThan(0);
  });

  it('returns a safe message rather than the internal exception name', async () => {
    let throttled: request.Response | undefined;

    for (let i = 0; i < 15; i++) {
      const response = await request(server)
        .post('/api/auth/login')
        .send({ email: 'nobody@tenzopay.dev', password: 'WrongPassword123' });

      if (response.status === 429) {
        throttled = response;
        break;
      }
    }

    expect(throttled).toBeDefined();
    expect(throttled!.body.code).toBe('RATE_LIMITED');
    expect(throttled!.body.message).toMatch(/too many requests/i);
    // Regression guard: Nest's ThrottlerException stringifies its own class
    // name into the body, which must never reach a user.
    expect(throttled!.body.message).not.toContain('ThrottlerException');
  });

  it('leaves webhook endpoints unthrottled', async () => {
    // Providers burst on retry; throttling their deliveries would drop events.
    // These 401 on signature verification, which is the point — they are
    // reached rather than rate-limited away.
    const statuses: number[] = [];
    for (let i = 0; i < 20; i++) {
      const response = await request(server)
        .post('/api/webhooks/lithic')
        .set('webhook-id', `msg_${i}`)
        .set('webhook-timestamp', String(Math.floor(Date.now() / 1000)))
        .set('webhook-signature', 'v1,invalid')
        .send({ event_type: 'card_transaction.updated' });

      statuses.push(response.status);
    }

    expect(statuses).not.toContain(429);
  });

  it('leaves the health check unthrottled', async () => {
    for (let i = 0; i < 30; i++) {
      await request(server).get('/api/health').expect(200);
    }
  });
});
