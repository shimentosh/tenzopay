import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { Prisma } from '@prisma/client';
import { AppError } from './errors';
import { redact } from './redact';

/**
 * The single boundary between internal failures and what a user sees.
 *
 * Contract: the client receives a stable `code`, a safe `message`, and a
 * `requestId`. Provider payloads, SQL, and stack traces are logged server-side
 * and never serialized into the response.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('Exception');

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();
    const requestId = request.requestId ?? 'unknown';

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let code = 'INTERNAL_ERROR';
    let message = 'Something went wrong. Please try again.';
    let details: unknown;

    if (exception instanceof AppError) {
      status = exception.getStatus();
      const body = exception.getResponse() as { code?: string; message?: string };
      code = body.code ?? 'APP_ERROR';
      message = body.message ?? message;
      details = (exception as AppError & { internal?: unknown }).internal;

      // Validation details are safe and genuinely useful to the client.
      if (code === 'VALIDATION_ERROR') {
        this.send(response, status, { code, message, requestId, details });
        this.logger.debug(`[${requestId}] ${code}: ${message}`);
        return;
      }
    } else if (exception instanceof HttpException) {
      status = exception.getStatus();

      if (status === HttpStatus.TOO_MANY_REQUESTS) {
        // Nest's ThrottlerException stringifies its own class name into the
        // body. Users get a plain sentence, not an internal exception name.
        code = 'RATE_LIMITED';
        message = 'Too many requests. Please wait a moment and try again.';
      } else if (status === HttpStatus.NOT_FOUND) {
        code = 'NOT_FOUND';
        message = 'The requested item could not be found.';
      } else if (status === HttpStatus.PAYLOAD_TOO_LARGE) {
        code = 'PAYLOAD_TOO_LARGE';
        message = 'That request was too large.';
      } else {
        const body = exception.getResponse();
        code = 'HTTP_ERROR';
        message =
          typeof body === 'string'
            ? body
            : ((body as { message?: string }).message ?? message);
      }
    } else if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      // Never leak table or constraint names to the client.
      if (exception.code === 'P2002') {
        status = HttpStatus.CONFLICT;
        code = 'ALREADY_EXISTS';
        message = 'That record already exists.';
      } else if (exception.code === 'P2025') {
        status = HttpStatus.NOT_FOUND;
        code = 'NOT_FOUND';
        message = 'The requested item could not be found.';
      } else {
        code = 'DATABASE_ERROR';
      }
      details = { prismaCode: exception.code };
    }

    const logPayload = {
      requestId,
      method: request.method,
      path: request.originalUrl?.split('?')[0],
      userId: request.user?.id,
      adminId: request.admin?.id,
      status,
      code,
      internal: redact(details),
    };

    if (status >= 500) {
      this.logger.error(
        JSON.stringify(logPayload),
        exception instanceof Error ? exception.stack : undefined,
      );
    } else {
      this.logger.warn(JSON.stringify(logPayload));
    }

    this.send(response, status, { code, message, requestId });
  }

  private send(
    response: Response,
    status: number,
    body: Record<string, unknown>,
  ): void {
    response.status(status).json({ statusCode: status, ...body });
  }
}
