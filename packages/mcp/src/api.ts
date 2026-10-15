/**
 * A small client for the coordinator's public, read-only API. It only ever sends GET requests.
 */

export class ApiError extends Error {
  override name = 'ApiError';
  readonly status: number | null;
  readonly code: string | null;

  constructor(message: string, status: number | null, code: string | null) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export interface ApiOptions {
  baseUrl: string;
  fetch?: typeof fetch;
  timeoutMs?: number;
}

export interface MineraApi {
  readonly baseUrl: string;
  get(path: string, query?: Record<string, string | number | undefined>): Promise<unknown>;
}

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;

/** The coordinator's own error message, when the body carries one. */
function errorOf(body: unknown): { code: string; message: string } | null {
  if (!isObject(body) || !isObject(body['error'])) return null;
  const { code, message } = body['error'];
  return typeof code === 'string' && typeof message === 'string' ? { code, message } : null;
}

export function createApi({ baseUrl, fetch: fetchImpl = fetch, timeoutMs = 15_000 }: ApiOptions): MineraApi {
  const base = baseUrl.replace(/\/+$/, '');
  return {
    baseUrl: base,
    async get(path, query = {}) {
      const url = new URL(`${base}${path}`);
      for (const [key, value] of Object.entries(query)) if (value !== undefined) url.searchParams.set(key, String(value));
      let response: Response;
      try {
        response = await fetchImpl(url, { headers: { accept: 'application/json' }, signal: AbortSignal.timeout(timeoutMs) });
      } catch (error) {
        const timedOut = error instanceof Error && error.name === 'TimeoutError';
        throw new ApiError(timedOut ? 'The network service took too long to answer.' : 'The network service could not be reached.', null, null);
      }
      let body: unknown = null;
      try {
        body = await response.json();
      } catch {
        body = null;
      }
      if (!response.ok) {
        const failure = errorOf(body);
        throw new ApiError(failure?.message ?? `The network service answered ${response.status}.`, response.status, failure?.code ?? null);
      }
      return body;
    },
  };
}
