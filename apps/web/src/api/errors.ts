/** Every coordinator problem the site reports, as a sentence a person can act on. */
export const API_MESSAGES = {
  unconfigured: 'This site was built without the network service address, so live data is unavailable.',
  unreachable: 'The network service could not be reached. Check your connection and try again.',
  timeout: 'The network service took too long to answer. Try again.',
  server: 'The network service had a problem. Try again shortly.',
  malformed: 'The network service sent an answer this page could not read. Try again shortly.',
} as const;

interface ApiErrorDetails {
  /** The HTTP status, or null when no response arrived. */
  status: number | null;
  /** The coordinator's error code, or a local one for failures before a response. */
  code: string;
  retryAfterSeconds?: number | null;
}

export class ApiError extends Error {
  override name = 'ApiError';
  readonly status: number | null;
  readonly code: string;
  /** How long the coordinator asked the client to wait, when it said. */
  readonly retryAfterSeconds: number | null;

  constructor(message: string, details: ApiErrorDetails) {
    super(message);
    this.status = details.status;
    this.code = details.code;
    this.retryAfterSeconds = details.retryAfterSeconds ?? null;
  }
}

const UNIT_SECONDS: Readonly<Record<string, number>> = { second: 1, minute: 60, hour: 3600 };

/**
 * The wait before retrying, from the Retry-After header when the browser exposes it, or else from
 * the coordinator's sentence ("Try again in 45 seconds.").
 */
export function retryAfter(header: string | null, message: string): number | null {
  if (header !== null && /^\d+$/.test(header.trim())) return Number(header.trim());
  const match = /in (\d+) (second|minute|hour)s?\b/i.exec(message);
  if (!match?.[1] || !match[2]) return null;
  return Number(match[1]) * (UNIT_SECONDS[match[2].toLowerCase()] ?? 1);
}
