import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import type { NestExpressApplication } from '@nestjs/platform-express';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import express, { type Request, type Response } from 'express';
import { AppModule } from './app.module';
import type { AppConfig } from './config/configuration';
import { AllExceptionsFilter } from './common/all-exceptions.filter';
import { installBigIntSerializer } from './common/serialization';

async function bootstrap(): Promise<void> {
  // Money is bigint end to end; without this, serializing any response
  // containing one throws.
  installBigIntSerializer();

  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bufferLogs: true,
  });

  const configService = app.get(ConfigService<{ app: AppConfig }, true>);
  const config = configService.get('app', { infer: true });
  const logger = new Logger('Bootstrap');

  app.setGlobalPrefix('api');

  /**
   * Capture the raw request body for webhook signature verification.
   *
   * Signatures cover the exact bytes sent. Re-serializing the parsed object
   * changes key order and whitespace and silently breaks verification, so the
   * original buffer is preserved on the request.
   */
  app.use(
    express.json({
      limit: '1mb',
      verify: (req: Request, _res: Response, buf: Buffer) => {
        (req as Request & { rawBody?: Buffer }).rawBody = Buffer.from(buf);
      },
    }),
  );
  app.use(express.urlencoded({ extended: true, limit: '1mb' }));
  app.use(cookieParser());

  app.use(
    helmet({
      contentSecurityPolicy: false, // the API serves JSON, not documents
      crossOriginResourcePolicy: { policy: 'same-site' },
    }),
  );

  // Strict allowlist. Credentials are required for the httpOnly cookie auth,
  // which makes a wildcard origin both invalid and dangerous.
  app.enableCors({
    origin: (origin, callback) => {
      if (!origin || config.corsOrigins.includes(origin)) {
        callback(null, true);
        return;
      }
      logger.warn(`Blocked CORS request from origin: ${origin}`);
      callback(new Error('Not allowed by CORS'));
    },
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-Id'],
  });

  // Validation is per-route via ZodValidationPipe. Nest's global
  // ValidationPipe is deliberately not installed: it needs class-validator,
  // and two validation systems would mean two sources of truth for the
  // request contract.
  app.useGlobalFilters(new AllExceptionsFilter());

  app.enableShutdownHooks();

  await app.listen(config.port, '0.0.0.0');

  logger.log(`TenzoPay API listening on http://localhost:${config.port}/api`);
  logger.log(
    `env=${config.appEnv}  cards=${config.lithic.enabled ? `lithic:${config.lithic.environment}` : 'mock'}  ` +
      `chain=${config.alchemy.enabled ? 'alchemy' : 'mock'}  deposits=${config.deposits.mode}`,
  );

  if (config.deposits.mode === 'demo') {
    logger.warn(
      'DEPOSIT_MODE=demo — deposits are simulated. These are not real funds.',
    );
  }
  if (!config.lithic.asaSecret) {
    logger.warn(
      'LITHIC_ASA_SECRET is not set. Authorization decisioning will run without ' +
        'signature verification (development only).',
    );
  }
}

void bootstrap();
