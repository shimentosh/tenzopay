import { HttpException, HttpStatus } from '@nestjs/common';

/**
 * Domain errors.
 *
 * Rule: the `message` on an AppError is USER-FACING and safe to render.
 * Provider internals, SQL, stack traces and tokens go to the server log via
 * `internal`, never to the client. See AllExceptionsFilter.
 */
export class AppError extends HttpException {
  constructor(
    public readonly code: string,
    message: string,
    status: HttpStatus = HttpStatus.BAD_REQUEST,
    public readonly internal?: unknown,
  ) {
    super({ code, message, statusCode: status }, status);
  }
}

export class InsufficientBalanceError extends AppError {
  constructor(
    public readonly available: bigint,
    public readonly requested: bigint,
  ) {
    super(
      'INSUFFICIENT_BALANCE',
      'Insufficient available balance for this transaction.',
      HttpStatus.UNPROCESSABLE_ENTITY,
      { available: available.toString(), requested: requested.toString() },
    );
  }
}

export class LedgerImbalanceError extends AppError {
  constructor(detail: string) {
    super(
      'LEDGER_IMBALANCE',
      'A ledger consistency check failed. The operation was not applied.',
      HttpStatus.INTERNAL_SERVER_ERROR,
      detail,
    );
  }
}

export class ProviderUnavailableError extends AppError {
  constructor(provider: string, internal?: unknown) {
    super(
      'PROVIDER_UNAVAILABLE',
      'This service is temporarily unavailable. Please try again shortly.',
      HttpStatus.SERVICE_UNAVAILABLE,
      { provider, internal },
    );
  }
}

export class CardOperationError extends AppError {
  constructor(message: string, internal?: unknown) {
    super('CARD_OPERATION_FAILED', message, HttpStatus.BAD_REQUEST, internal);
  }
}

export class KycRequiredError extends AppError {
  constructor() {
    super(
      'KYC_REQUIRED',
      'Complete identity verification before using this feature.',
      HttpStatus.FORBIDDEN,
    );
  }
}

export class NotFoundError extends AppError {
  constructor(what = 'Resource') {
    super('NOT_FOUND', `${what} not found.`, HttpStatus.NOT_FOUND);
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'You do not have permission to perform this action.') {
    super('FORBIDDEN', message, HttpStatus.FORBIDDEN);
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = 'Authentication required.') {
    super('UNAUTHORIZED', message, HttpStatus.UNAUTHORIZED);
  }
}

export class ValidationError extends AppError {
  constructor(message: string, details?: unknown) {
    super('VALIDATION_ERROR', message, HttpStatus.BAD_REQUEST, details);
  }
}

export class WebhookVerificationError extends AppError {
  constructor(provider: string, internal?: unknown) {
    super(
      'WEBHOOK_VERIFICATION_FAILED',
      'Signature verification failed.',
      HttpStatus.UNAUTHORIZED,
      { provider, internal },
    );
  }
}

export class DepositModeError extends AppError {
  constructor(message: string) {
    super('DEPOSIT_MODE_FORBIDDEN', message, HttpStatus.FORBIDDEN);
  }
}

export class RateLimitError extends AppError {
  constructor() {
    super(
      'RATE_LIMITED',
      'Too many requests. Please slow down and try again.',
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }
}
