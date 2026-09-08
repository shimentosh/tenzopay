import { Injectable, Logger, NestMiddleware } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';

/**
 * Structured request logging.
 *
 * Emits one JSON line per request with requestId, method, path, status,
 * latency and actor. Query strings are dropped and bodies are never logged —
 * they routinely carry passwords, government IDs and card data.
 */
@Injectable()
export class LoggingMiddleware implements NestMiddleware {
  private readonly logger = new Logger('HTTP');

  use(req: Request, res: Response, next: NextFunction): void {
    const requestId = (req.headers['x-request-id'] as string) || randomUUID();
    req.requestId = requestId;
    res.setHeader('x-request-id', requestId);

    const started = process.hrtime.bigint();

    res.on('finish', () => {
      const latencyMs = Number(process.hrtime.bigint() - started) / 1_000_000;

      const line = {
        requestId,
        method: req.method,
        path: req.originalUrl?.split('?')[0],
        status: res.statusCode,
        latencyMs: Math.round(latencyMs * 100) / 100,
        userId: req.user?.id,
        adminId: req.admin?.id,
        ip: req.ip,
      };

      if (res.statusCode >= 500) this.logger.error(JSON.stringify(line));
      else if (res.statusCode >= 400) this.logger.warn(JSON.stringify(line));
      else this.logger.log(JSON.stringify(line));
    });

    next();
  }
}
