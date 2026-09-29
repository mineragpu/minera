import type { FastifyBaseLogger } from 'fastify';

/** The logging surface background workers need; the server hands them its request logger. */
export type Logger = Pick<FastifyBaseLogger, 'debug' | 'info' | 'warn' | 'error'>;
