import { ArgumentMetadata, Injectable, PipeTransform } from '@nestjs/common';
import type { ZodSchema } from 'zod';
import { ValidationError } from './errors';

/**
 * Validates a request body/query against a Zod schema and returns the PARSED
 * value, so downstream code receives coerced, trimmed, defaulted data rather
 * than whatever arrived on the wire.
 *
 * Uses `safeParse` rather than `parse` inside a try/catch deliberately.
 * Catching and testing `err instanceof ZodError` depends on there being exactly
 * one ZodError class identity in the process — which breaks the moment a
 * bundler, a dual CJS/ESM entry point, or a duplicated dependency introduces a
 * second copy. When that happens the check silently fails and a clean 400 turns
 * into a 500. `safeParse` returns a discriminated result and needs no identity
 * check at all.
 */
@Injectable()
export class ZodValidationPipe<T> implements PipeTransform {
  constructor(private readonly schema: ZodSchema<T>) {}

  transform(value: unknown, _metadata: ArgumentMetadata): T {
    const result = this.schema.safeParse(value);

    if (result.success) return result.data;

    const details = result.error.issues.map((issue) => ({
      field: issue.path.join('.') || '(root)',
      message: issue.message,
    }));

    throw new ValidationError(
      details[0]?.message ?? 'The submitted data is invalid.',
      details,
    );
  }
}

export const zodPipe = <T>(schema: ZodSchema<T>) => new ZodValidationPipe(schema);
