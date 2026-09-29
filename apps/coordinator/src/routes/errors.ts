import type { FastifyError, FastifyInstance } from 'fastify';
import { NodeAuthError } from '../auth/nodeAuth.ts';
import { PlaygroundBusyError } from '../jobs/playground.ts';

export interface ErrorDetail {
  path: string;
  message: string;
}

/** Every error response has this shape. */
export interface ErrorBody {
  error: { code: string; message: string; details?: ErrorDetail[] };
}

export class ApiError extends Error {
  override name = 'ApiError';
  readonly statusCode: number;
  readonly code: string;
  readonly details: ErrorDetail[] | undefined;

  constructor(statusCode: number, code: string, message: string, details?: ErrorDetail[]) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }
}

const CODES: Record<number, string> = {
  400: 'invalid_request',
  404: 'not_found',
  405: 'method_not_allowed',
  413: 'payload_too_large',
  415: 'unsupported_media_type',
  429: 'rate_limited',
};

function body(code: string, message: string, details?: ErrorDetail[]): ErrorBody {
  return { error: details ? { code, message, details } : { code, message } };
}

function toApiError(error: unknown): ApiError | null {
  if (error instanceof ApiError) return error;
  if (error instanceof NodeAuthError) return new ApiError(error.statusCode, error.code, error.message);
  if (error instanceof PlaygroundBusyError) {
    return new ApiError(503, 'busy', 'The network has too many prompts waiting. Try again in a minute.');
  }
  const status = (error as Partial<FastifyError>).statusCode;
  if (typeof status === 'number' && status >= 400 && status < 500) {
    return new ApiError(status, CODES[status] ?? 'request_error', (error as Error).message);
  }
  return null;
}

export function registerErrorHandling(app: FastifyInstance): void {
  app.setErrorHandler((error, request, reply) => {
    const known = toApiError(error);
    if (known) {
      if (known.statusCode >= 500) request.log.warn({ code: known.code }, known.message);
      return reply.status(known.statusCode).send(body(known.code, known.message, known.details));
    }
    request.log.error({ err: error }, 'request failed');
    return reply.status(500).send(body('internal_error', 'Something went wrong on our side. Try again shortly.'));
  });

  app.setNotFoundHandler((_request, reply) => {
    return reply.status(404).send(body('not_found', 'There is no such route.'));
  });
}
