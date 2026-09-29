import type { FastifyBaseLogger } from 'fastify';
import { BaseError } from 'viem';

/** The logging surface background workers need; the server hands them its request logger. */
export type Logger = Pick<FastifyBaseLogger, 'debug' | 'info' | 'warn' | 'error'>;

/**
 * A loggable summary of an error. RPC errors are reduced to their short message, because their
 * full text repeats the endpoint URL, which can carry an API key.
 */
export function errorSummary(error: unknown): { name: string; message: string } {
  if (error instanceof BaseError) return { name: error.name, message: error.shortMessage };
  if (error instanceof Error) return { name: error.name, message: error.message };
  return { name: 'Error', message: String(error) };
}
