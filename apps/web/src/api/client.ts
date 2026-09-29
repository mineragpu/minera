import { API_BASE } from '../config/api.ts';
import { DecodeError, type Decoder } from './decode.ts';
import { API_MESSAGES, ApiError, retryAfter } from './errors.ts';

const TIMEOUT_MS = 15_000;

interface RequestOptions {
  method?: 'GET' | 'POST';
  /** Sent as JSON. */
  body?: unknown;
  signal?: AbortSignal;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/** The coordinator's `{ error: { code, message } }` body, when the response carries one. */
function errorBody(payload: unknown): { code: string; message: string } | null {
  if (!isRecord(payload) || !isRecord(payload.error)) return null;
  const { code, message } = payload.error;
  return typeof code === 'string' && typeof message === 'string' ? { code, message } : null;
}

function responseError(response: Response, payload: unknown): ApiError {
  const body = errorBody(payload);
  if (!body || response.status >= 500) {
    return new ApiError(body?.message ?? API_MESSAGES.server, {
      status: response.status,
      code: body?.code ?? 'server_error',
    });
  }
  return new ApiError(body.message, {
    status: response.status,
    code: body.code,
    retryAfterSeconds: response.status === 429 ? retryAfter(response.headers.get('retry-after'), body.message) : null,
  });
}

/** Calls the coordinator and checks the answer against `decoder`. Every failure is an ApiError. */
export async function requestJson<T>(path: string, decoder: Decoder<T>, options: RequestOptions = {}): Promise<T> {
  if (API_BASE === null) throw new ApiError(API_MESSAGES.unconfigured, { status: null, code: 'unconfigured' });

  const timeout = AbortSignal.timeout(TIMEOUT_MS);
  const init: RequestInit = {
    method: options.method ?? 'GET',
    headers: { accept: 'application/json' },
    signal: options.signal ? AbortSignal.any([options.signal, timeout]) : timeout,
  };
  if (options.body !== undefined) {
    init.headers = { accept: 'application/json', 'content-type': 'application/json' };
    init.body = JSON.stringify(options.body);
  }

  let response: Response;
  try {
    response = await fetch(`${API_BASE}${path}`, init);
  } catch (cause) {
    // A caller that cancelled wants its own abort back, not a message.
    if (options.signal?.aborted) throw cause;
    if (timeout.aborted) throw new ApiError(API_MESSAGES.timeout, { status: null, code: 'timeout' });
    throw new ApiError(API_MESSAGES.unreachable, { status: null, code: 'unreachable' });
  }

  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) throw responseError(response, payload);
  try {
    return decoder(payload, 'response');
  } catch (cause) {
    if (cause instanceof DecodeError) throw new ApiError(API_MESSAGES.malformed, { status: response.status, code: 'malformed' });
    throw cause;
  }
}
