/**
 * The coordinator API as the node sees it: every call is a signed POST with a JSON body, and every
 * reply is checked against the protocol before it is returned.
 */

import {
  MAX_CLOCK_SKEW_SECONDS,
  NODE_ROUTES,
  type HeartbeatRequest,
  type HelloRequest,
  type HelloResponse,
  type JobResultRequest,
  type JobResultResponse,
} from '@minera/shared';
import type { MessageSigner } from './deploy-code.ts';
import { sanitize } from './logger.ts';
import {
  ProtocolError,
  parseHeartbeatResponse,
  parseHelloResponse,
  parseJobResultResponse,
  type ParsedHeartbeat,
} from './schema.ts';
import { signRequest } from './signer.ts';
import { endpoint } from './url.ts';

export interface CoordinatorClient {
  hello(request: HelloRequest): Promise<HelloResponse>;
  heartbeat(request: HeartbeatRequest): Promise<ParsedHeartbeat>;
  submitResult(jobId: string, result: JobResultRequest): Promise<JobResultResponse>;
}

export interface CoordinatorClientOptions {
  baseUrl: string;
  signer: MessageSigner;
  /** The chain of the network the node runs on. Every request is signed for it alone. */
  chainId: number;
  userAgent: string;
  timeoutMs?: number;
  /** Cancels every request in flight, for a hard stop. */
  signal?: AbortSignal;
}

export class CoordinatorError extends Error {
  /** The HTTP status, or null when no reply arrived. */
  readonly status: number | null;
  /** True when the same request may succeed later: no reply, a timeout, rate limiting or a 5xx. */
  readonly retryable: boolean;

  constructor(message: string, status: number | null, retryable: boolean) {
    super(message);
    this.name = 'CoordinatorError';
    this.status = status;
    this.retryable = retryable;
  }
}

const DEFAULT_TIMEOUT_MS = 20_000;
const MAX_REASON_LENGTH = 200;

function networkProblem(error: unknown): string {
  if (error instanceof Error && error.name === 'TimeoutError') return 'no reply in time';
  if (error instanceof Error && error.name === 'AbortError') return 'cancelled';
  const cause = error instanceof Error ? (error.cause as NodeJS.ErrnoException | undefined) : undefined;
  switch (cause?.code) {
    case 'ECONNREFUSED':
      return 'connection refused';
    case 'ENOTFOUND':
    case 'EAI_AGAIN':
      return 'host not found';
    case 'ECONNRESET':
      return 'connection reset';
    case 'ETIMEDOUT':
    case 'UND_ERR_CONNECT_TIMEOUT':
      return 'connection timed out';
    default:
      return cause?.code ? sanitize(cause.code) : 'network error';
  }
}

function isRedirect(error: unknown): boolean {
  const cause = error instanceof Error ? error.cause : undefined;
  return cause instanceof Error && /redirect/i.test(cause.message);
}

async function reasonFrom(response: Response): Promise<string> {
  const text = (await response.text().catch(() => '')).slice(0, 4_096);
  try {
    const body: unknown = JSON.parse(text);
    if (typeof body === 'object' && body !== null) {
      const { error, message } = body as Record<string, unknown>;
      const reason = typeof message === 'string' ? message : typeof error === 'string' ? error : '';
      return sanitize(reason).slice(0, MAX_REASON_LENGTH).replace(/[.\s]+$/, '');
    }
  } catch {
    return '';
  }
  return '';
}

function clockHint(response: Response): string {
  const date = Date.parse(response.headers.get('date') ?? '');
  if (Number.isNaN(date)) return '';
  const skew = Math.round((Date.now() - date) / 1000);
  if (Math.abs(skew) < MAX_CLOCK_SKEW_SECONDS / 2) return '';
  const direction = skew > 0 ? 'ahead of' : 'behind';
  return ` This machine's clock is about ${Math.abs(skew)} seconds ${direction} the coordinator's; sync it.`;
}

async function httpError(response: Response): Promise<CoordinatorError> {
  const { status } = response;
  const reason = await reasonFrom(response);
  const hint = status === 401 ? clockHint(response) : '';
  const retryable = status === 408 || status === 429 || status >= 500;
  return new CoordinatorError(
    `The coordinator answered HTTP ${status}${reason ? `: ${reason}` : ''}.${hint}`,
    status,
    retryable,
  );
}

export function createCoordinatorClient(options: CoordinatorClientOptions): CoordinatorClient {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  async function post<T>(route: string, payload: unknown, parse: (value: unknown) => T): Promise<T> {
    const url = endpoint(options.baseUrl, route);
    const body = new TextEncoder().encode(JSON.stringify(payload));
    const signed = await signRequest(options.signer, options.chainId, { method: 'POST', path: url.pathname, body });
    const timeout = AbortSignal.timeout(timeoutMs);
    const signal = options.signal ? AbortSignal.any([options.signal, timeout]) : timeout;

    let response: Response;
    try {
      response = await fetch(url, {
        method: 'POST',
        headers: { ...signed, 'content-type': 'application/json', 'user-agent': options.userAgent },
        body,
        // A redirect would carry a signed request to a URL the operator never chose.
        redirect: 'error',
        signal,
      });
    } catch (error) {
      if (isRedirect(error)) {
        throw new CoordinatorError('The coordinator URL redirects elsewhere. Use the final URL instead.', null, false);
      }
      throw new CoordinatorError(`Could not reach the coordinator (${networkProblem(error)}).`, null, true);
    }
    if (!response.ok) throw await httpError(response);

    let json: unknown;
    try {
      json = await response.json();
    } catch (error) {
      if (!(error instanceof SyntaxError)) {
        throw new CoordinatorError(`Could not reach the coordinator (${networkProblem(error)}).`, null, true);
      }
      throw new CoordinatorError('The coordinator sent a reply that is not JSON.', response.status, false);
    }
    try {
      return parse(json);
    } catch (error) {
      if (!(error instanceof ProtocolError)) throw error;
      const message = `The coordinator sent a reply this client cannot use. ${error.message}`;
      throw new CoordinatorError(message, response.status, false);
    }
  }

  return {
    hello: (request) => post(NODE_ROUTES.hello, request, parseHelloResponse),
    heartbeat: (request) => post(NODE_ROUTES.heartbeat, request, parseHeartbeatResponse),
    submitResult: (jobId, result) => post(NODE_ROUTES.result(jobId), result, parseJobResultResponse),
  };
}
