import { z } from 'zod';
import { ApiError } from './errors.ts';

/** Parse a request part against its schema, or answer 400 listing every problem found. */
export function parse<T extends z.ZodType>(schema: T, value: unknown, part: 'body' | 'query' | 'params'): z.output<T> {
  const result = schema.safeParse(value);
  if (result.success) return result.data;
  const details = result.error.issues.map((issue) => ({
    path: [part, ...issue.path.map(String)].join('.'),
    message: issue.message,
  }));
  throw new ApiError(400, 'invalid_request', `The request ${part} is not valid.`, details);
}

export const addressSchema = z
  .string()
  .regex(/^0x[0-9a-fA-F]{40}$/, 'Expected a 0x-prefixed 20-byte address.')
  .transform((value) => value.toLowerCase() as `0x${string}`);

export const jobIdSchema = z.uuid('Expected a job id.');
