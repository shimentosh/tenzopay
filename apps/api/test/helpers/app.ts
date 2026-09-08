import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import express, { type Request, type Response } from 'express';
import cookieParser from 'cookie-parser';
import * as argon2 from 'argon2';
import { AdminRole } from '@prisma/client';
import { AppModule } from '../../src/app.module';
import { PrismaService } from '../../src/prisma/prisma.service';
import { AllExceptionsFilter } from '../../src/common/all-exceptions.filter';
import { installBigIntSerializer } from '../../src/common/serialization';

/**
 * Boots the real Nest application for HTTP-level tests.
 *
 * Deliberately the *whole* app, not a stripped-down module: guards, pipes,
 * filters, throttling and cookie handling are exactly what these tests are
 * asserting, and a hand-assembled test module would quietly skip them.
 *
 * Providers are forced to mock so no test ever calls Lithic or Alchemy.
 */
export async function createTestApp(
  options: { throttle?: boolean; logger?: boolean } = {},
): Promise<{ app: INestApplication; prisma: PrismaService }> {
  installBigIntSerializer();

  // Must be set before AppModule's config factory runs.
  process.env.CARD_PROVIDER = 'mock';
  process.env.BLOCKCHAIN_PROVIDER = 'mock';
  process.env.DEPOSIT_MODE = 'demo';
  process.env.APP_ENV = 'development';

  // Rate limiting is real and deliberately tight (5 registrations/minute), so
  // it would fail an exhaustive suite for the right reason. The throttler's
  // own skipIf honours this flag under NODE_ENV=test only; throttling.spec.ts
  // clears it to exercise the live guard.
  process.env.NODE_ENV = 'test';
  process.env.DISABLE_RATE_LIMIT = options.throttle ? 'false' : 'true';

  const moduleRef = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();

  const app = moduleRef.createNestApplication<NestExpressApplication>({
    logger: options.logger ? ['error', 'warn'] : false,
  });

  app.setGlobalPrefix('api');

  // Mirrors main.ts: the raw body is required for signature verification.
  app.use(
    express.json({
      verify: (req: Request, _res: Response, buf: Buffer) => {
        (req as Request & { rawBody?: Buffer }).rawBody = Buffer.from(buf);
      },
    }),
  );
  app.use(cookieParser());
  app.useGlobalFilters(new AllExceptionsFilter());

  await app.init();

  return { app, prisma: app.get(PrismaService) };
}

/** Wipes every table in dependency order. */
export async function resetDatabase(prisma: PrismaService): Promise<void> {
  await prisma.authorizationEvent.deleteMany();
  await prisma.cardTransaction.deleteMany();
  await prisma.cardRule.deleteMany();
  await prisma.card.deleteMany();
  await prisma.blockchainTransaction.deleteMany();
  await prisma.deposit.deleteMany();
  await prisma.depositAddress.deleteMany();
  await prisma.ledgerEntry.deleteMany();
  await prisma.ledgerTransaction.deleteMany();
  await prisma.ledgerAccount.deleteMany();
  await prisma.fee.deleteMany();
  await prisma.notification.deleteMany();
  await prisma.kycRecord.deleteMany();
  await prisma.accountHolder.deleteMany();
  await prisma.wallet.deleteMany();
  await prisma.session.deleteMany();
  await prisma.webhookEvent.deleteMany();
  await prisma.auditLog.deleteMany();
  await prisma.adminAction.deleteMany();
  await prisma.user.deleteMany();
  await prisma.adminUser.deleteMany();
}

export async function createAdmin(
  prisma: PrismaService,
  role: AdminRole,
  password = 'AdminPassword123',
): Promise<{ email: string; password: string; id: string }> {
  const email = `${role.toLowerCase()}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@test.dev`;

  const admin = await prisma.adminUser.create({
    data: {
      email,
      name: `${role} tester`,
      role,
      passwordHash: await argon2.hash(password, {
        type: argon2.argon2id,
        memoryCost: 19_456,
        timeCost: 2,
        parallelism: 1,
      }),
    },
    select: { id: true },
  });

  return { email, password, id: admin.id };
}

/** Extracts a cookie value from a Set-Cookie header array. */
export function cookieFrom(
  headers: Record<string, unknown>,
  name: string,
): string | null {
  const raw = headers['set-cookie'];
  const list = Array.isArray(raw) ? (raw as string[]) : raw ? [String(raw)] : [];

  for (const entry of list) {
    const match = new RegExp(`${name}=([^;]+)`).exec(entry);
    if (match && match[1] && match[1] !== '') return match[1];
  }
  return null;
}

export const VALID_KYC = {
  firstName: 'Ada',
  lastName: 'Lovelace',
  dob: '1991-03-08',
  email: 'ada@example.com',
  phoneNumber: '+15555550142',
  governmentId: '111-23-1234',
  address1: '123 Main St',
  city: 'Austin',
  state: 'TX',
  postalCode: '78701',
  country: 'USA',
};
