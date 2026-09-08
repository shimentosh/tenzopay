import {
  Controller,
  Headers,
  HttpCode,
  Logger,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SkipThrottle } from '@nestjs/throttler';
import type { Request } from 'express';
import { WebhookProvider } from '@prisma/client';
import { Public } from '../auth/guards';
import { WebhooksService } from './webhooks.service';
import { AsaService, type AsaRequest } from './asa.service';
import type { AppConfig } from '../config/configuration';
import {
  verifyAlchemySignature,
  verifyLithicSignature,
} from '../common/crypto.util';
import { WebhookVerificationError } from '../common/errors';

/**
 * Webhook endpoints.
 *
 * Two rules apply to every handler here:
 *
 * 1. **Verify against the RAW body.** The signature covers the exact bytes
 *    sent. `express.json()` re-serialization changes key order and whitespace,
 *    which silently breaks verification — hence `rawBody` captured in main.ts.
 *
 * 2. **Persist, acknowledge, then process.** Returning 200 quickly stops the
 *    provider's retry cascade; the work happens after. The exception is ASA,
 *    which must decide synchronously.
 */
@Controller('webhooks')
@SkipThrottle()
export class WebhooksController {
  private readonly logger = new Logger(WebhooksController.name);
  private readonly config: AppConfig;

  constructor(
    private readonly webhooks: WebhooksService,
    private readonly asa: AsaService,
    configService: ConfigService<{ app: AppConfig }, true>,
  ) {
    this.config = configService.get('app', { infer: true });
  }

  // ---------------------------------------------------------------- ASA ----

  /**
   * Real-time authorization decisioning. Lithic waits on this response, so it
   * must be synchronous and fast (3 s target, 6 s hard timeout).
   */
  @Public()
  @Post('lithic/asa')
  @HttpCode(200)
  async lithicAsa(
    @Req() req: Request,
    @Headers('webhook-id') webhookId?: string,
    @Headers('webhook-timestamp') timestamp?: string,
    @Headers('webhook-signature') signature?: string,
  ) {
    const secret = this.config.lithic.asaSecret;

    // Signature verification is the only authentication ASA has — Lithic
    // publishes no static IP range to allowlist.
    if (secret) {
      const result = verifyLithicSignature({
        secret,
        webhookId: webhookId ?? '',
        webhookTimestamp: timestamp ?? '',
        rawBody: this.rawBody(req),
        signatureHeader: signature ?? '',
      });

      if (!result.valid) {
        this.logger.error(`ASA signature verification failed: ${result.reason}`);
        throw new WebhookVerificationError('lithic-asa', result.reason);
      }
    } else if (this.config.isProduction) {
      // Never run unauthenticated authorization decisioning in production.
      throw new WebhookVerificationError('lithic-asa', 'no_secret_configured');
    } else {
      this.logger.warn('ASA running without signature verification (dev only)');
    }

    return this.asa.decide(req.body as AsaRequest);
  }

  // ------------------------------------------------------------- Lithic ----

  @Public()
  @Post('lithic')
  @HttpCode(200)
  async lithic(
    @Req() req: Request,
    @Headers('webhook-id') webhookId?: string,
    @Headers('webhook-timestamp') timestamp?: string,
    @Headers('webhook-signature') signature?: string,
  ) {
    const secret = this.config.lithic.webhookSecret;

    if (secret) {
      const result = verifyLithicSignature({
        secret,
        webhookId: webhookId ?? '',
        webhookTimestamp: timestamp ?? '',
        rawBody: this.rawBody(req),
        signatureHeader: signature ?? '',
      });

      if (!result.valid) {
        this.logger.error(`Lithic webhook verification failed: ${result.reason}`);
        throw new WebhookVerificationError('lithic', result.reason);
      }
    } else if (this.config.isProduction) {
      throw new WebhookVerificationError('lithic', 'no_secret_configured');
    }

    const payload = req.body as Record<string, unknown>;
    const eventId = webhookId ?? String(payload.token ?? payload.event_token ?? '');
    const eventType = String(payload.event_type ?? payload.type ?? 'unknown');

    // Persist and ack immediately; process out of band.
    const { accepted } = await this.webhooks.receive({
      provider: WebhookProvider.LITHIC,
      eventId,
      eventType,
      payload,
      rawBody: this.rawBody(req),
    });

    return { received: true, duplicate: !accepted };
  }

  // ------------------------------------------------------------ Alchemy ----

  @Public()
  @Post('alchemy')
  @HttpCode(200)
  async alchemy(
    @Req() req: Request,
    @Headers('x-alchemy-signature') signature?: string,
  ) {
    const signingKey = this.config.alchemy.webhookSigningKey;

    if (signingKey) {
      const result = verifyAlchemySignature({
        signingKey,
        rawBody: this.rawBody(req),
        signatureHeader: signature ?? '',
      });

      if (!result.valid) {
        this.logger.error(`Alchemy webhook verification failed: ${result.reason}`);
        throw new WebhookVerificationError('alchemy', result.reason);
      }
    } else if (this.config.isProduction) {
      throw new WebhookVerificationError('alchemy', 'no_signing_key_configured');
    }

    const payload = req.body as Record<string, unknown>;
    const eventId = String(payload.id ?? payload.webhookId ?? '');
    const eventType = String(payload.type ?? 'ADDRESS_ACTIVITY');

    const { accepted } = await this.webhooks.receive({
      provider: WebhookProvider.ALCHEMY,
      eventId,
      eventType,
      payload,
      rawBody: this.rawBody(req),
    });

    return { received: true, duplicate: !accepted };
  }

  /**
   * The exact bytes received. Falls back to a re-serialization only when the
   * raw capture is unavailable, which will fail verification loudly rather
   * than silently accepting an unverified payload.
   */
  private rawBody(req: Request): Buffer {
    const raw = (req as Request & { rawBody?: Buffer }).rawBody;
    if (raw) return raw;
    return Buffer.from(JSON.stringify(req.body ?? {}), 'utf8');
  }
}
