import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import type { AppConfig } from '../../config/configuration';
import { ProviderUnavailableError } from '../../common/errors';
import { redact } from '../../common/redact';

/**
 * Thin, typed HTTP client for the Lithic API.
 *
 * Written directly against the REST API (rather than the SDK) because every
 * endpoint here was verified by hand against the sandbox during design — see
 * docs/ARCHITECTURE.md §8 for the verification table. That gives exact control
 * over idempotency keys, backoff, and what may be logged.
 *
 * Behaviour that matters:
 *   - Auth header is the RAW api key. Lithic does NOT use a `Bearer` prefix.
 *   - `Idempotency-Key` is attached to every POST so retries cannot double-issue.
 *   - 429/5xx get bounded exponential backoff with jitter, honouring `retry-after`.
 *     Sandbox write limits are as low as 1 RPS, so this is not optional.
 *   - Only idempotent verbs and explicitly-keyed POSTs are retried.
 */

export interface LithicRequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  body?: unknown;
  idempotencyKey?: string;
  query?: Record<string, string | number | undefined>;
  maxRetries?: number;
  timeoutMs?: number;
}

const RETRYABLE_STATUS = new Set([408, 409, 429, 500, 502, 503, 504]);

@Injectable()
export class LithicClient {
  private readonly logger = new Logger(LithicClient.name);
  private readonly config: AppConfig['lithic'];

  constructor(configService: ConfigService<{ app: AppConfig }, true>) {
    this.config = configService.get('app', { infer: true }).lithic;
  }

  get baseUrl(): string {
    return this.config.baseUrl;
  }

  get isEnabled(): boolean {
    return this.config.enabled && !!this.config.apiKey;
  }

  async request<T>(path: string, options: LithicRequestOptions = {}): Promise<T> {
    const {
      method = 'GET',
      body,
      idempotencyKey,
      query,
      maxRetries = 4,
      timeoutMs = 15_000,
    } = options;

    if (!this.isEnabled) {
      throw new ProviderUnavailableError('lithic', 'Lithic provider is not configured');
    }

    const url = new URL(path, this.config.baseUrl);
    if (query) {
      for (const [key, value] of Object.entries(query)) {
        if (value !== undefined && value !== '') url.searchParams.set(key, String(value));
      }
    }

    const headers: Record<string, string> = {
      // Raw key — verified: a "Bearer " prefix is rejected by Lithic.
      Authorization: this.config.apiKey,
      Accept: 'application/json',
      'User-Agent': 'TenzoPay/0.1',
    };

    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (method === 'POST') {
      headers['Idempotency-Key'] = idempotencyKey ?? randomUUID();
    }

    let lastError: unknown;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      const started = Date.now();

      try {
        const response = await fetch(url, {
          method,
          headers,
          body: body === undefined ? undefined : JSON.stringify(body),
          signal: controller.signal,
        });

        const latencyMs = Date.now() - started;
        const text = await response.text();
        const parsed = text ? this.tryParse(text) : undefined;

        if (response.ok) {
          this.logger.debug(
            `lithic ${method} ${path} -> ${response.status} (${latencyMs}ms, attempt ${attempt + 1})`,
          );
          return parsed as T;
        }

        // A 4xx that is not rate limiting is a real, non-retryable error.
        if (!RETRYABLE_STATUS.has(response.status)) {
          this.logger.warn(
            `lithic ${method} ${path} -> ${response.status} ${JSON.stringify(redact(parsed))}`,
          );
          throw new ProviderUnavailableError('lithic', {
            status: response.status,
            body: redact(parsed),
          });
        }

        lastError = { status: response.status, body: redact(parsed) };

        if (attempt === maxRetries) break;

        // Lithic returns `retry-after: 1` alongside 429.
        const retryAfter = Number(response.headers.get('retry-after'));
        const delay = Number.isFinite(retryAfter) && retryAfter > 0
          ? retryAfter * 1000
          : this.backoffMs(attempt);

        this.logger.warn(
          `lithic ${method} ${path} -> ${response.status}, retrying in ${delay}ms ` +
            `(attempt ${attempt + 1}/${maxRetries})`,
        );
        await this.sleep(delay);
      } catch (err) {
        clearTimeout(timer);

        if (err instanceof ProviderUnavailableError) throw err;

        lastError = err;
        if (attempt === maxRetries) break;

        const delay = this.backoffMs(attempt);
        this.logger.warn(
          `lithic ${method} ${path} network error, retrying in ${delay}ms: ` +
            `${err instanceof Error ? err.message : 'unknown'}`,
        );
        await this.sleep(delay);
        continue;
      } finally {
        clearTimeout(timer);
      }
    }

    this.logger.error(
      `lithic ${method} ${path} exhausted retries: ${JSON.stringify(redact(lastError))}`,
    );
    throw new ProviderUnavailableError('lithic', lastError);
  }

  /** Exponential backoff with full jitter: 250ms, 500ms, 1s, 2s (+/- jitter). */
  private backoffMs(attempt: number): number {
    const base = Math.min(250 * 2 ** attempt, 4000);
    return Math.floor(base / 2 + Math.random() * (base / 2));
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private tryParse(text: string): unknown {
    try {
      return JSON.parse(text);
    } catch {
      return { raw: text };
    }
  }
}
