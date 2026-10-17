/**
 * The GPU marketplace rented machines come from. The rest of the coordinator sees only `GpuMarket`,
 * so the marketplace can be replaced without touching the rental flow.
 */

import type { RentalConfig } from '../config.ts';

export interface MarketOffer {
  id: string;
  gpu: string;
  vramMb: number;
  /** Everything the machine costs an hour, with its disk, in millionths of a US dollar. */
  usdPerHourMicros: bigint;
}

export interface LaunchRequest {
  offerId: string;
  /** Names the machine on the marketplace, so machines without a rental can be found and destroyed. */
  label: string;
  /** The shell script the machine runs when it starts. */
  onstart: string;
}

/**
 * - `starting`: launched, still loading.
 * - `running`: up.
 * - `failed`: stopped, exited or offline; it will not come up on its own.
 * - `gone`: the marketplace no longer has it.
 */
export type MachineState = 'starting' | 'running' | 'failed' | 'gone';

export interface GpuMarket {
  /** The cheapest machine that meets the rental requirements, or null when none is on offer. */
  cheapestOffer(): Promise<MarketOffer | null>;
  /** Rents the offered machine and resolves its instance id; null when the offer was taken meanwhile. */
  launch(request: LaunchRequest): Promise<string | null>;
  machine(instanceId: string): Promise<{ state: MachineState; message: string | null }>;
  /** Destroys the machine, ending its billing. Destroying a machine that is gone succeeds. */
  destroy(instanceId: string): Promise<void>;
  /** Every machine on the account whose label starts with `prefix`. */
  labelled(prefix: string): Promise<{ instanceId: string; label: string }[]>;
}

export class MarketError extends Error {
  override name = 'MarketError';
  /** The marketplace asked to slow down, or did not answer; try again later. */
  readonly retryable: boolean;

  constructor(message: string, retryable: boolean) {
    super(message);
    this.retryable = retryable;
  }
}

type Fetcher = typeof fetch;

interface OfferRow {
  id?: unknown;
  gpu_name?: unknown;
  gpu_ram?: unknown;
  dph_total?: unknown;
}

interface InstanceRow {
  id?: unknown;
  label?: unknown;
  actual_status?: unknown;
  status_msg?: unknown;
}

const READY = new Set(['running']);
const LOADING = new Set([null, undefined, 'created', 'loading', 'rebooting', 'scheduling']);

function micros(dollars: unknown): bigint | null {
  return typeof dollars === 'number' && Number.isFinite(dollars) && dollars >= 0 ? BigInt(Math.ceil(dollars * 1_000_000)) : null;
}

function short(text: unknown): string | null {
  return typeof text === 'string' && text.trim() !== '' ? text.replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, 160) : null;
}

/** A client for the marketplace's REST API, configured by `RENTAL_MARKET_*`. */
export function createMarketClient(market: RentalConfig['market'], fetcher: Fetcher = fetch): GpuMarket {
  async function call(method: string, path: string, body?: unknown): Promise<{ status: number; json: unknown }> {
    let response: Response;
    try {
      response = await fetcher(`${market.url}${path}`, {
        method,
        headers: { authorization: `Bearer ${market.apiKey.reveal()}`, 'content-type': 'application/json' },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        redirect: 'error',
        signal: AbortSignal.timeout(20_000),
      });
    } catch {
      throw new MarketError(`the marketplace did not answer ${method} ${path.split('?')[0]}`, true);
    }
    const text = await response.text().catch(() => '');
    let json: unknown = null;
    try {
      json = text === '' ? null : JSON.parse(text);
    } catch {
      json = null;
    }
    if (response.status === 429 || response.status >= 500) {
      throw new MarketError(`the marketplace answered HTTP ${response.status} to ${method} ${path.split('?')[0]}`, true);
    }
    return { status: response.status, json };
  }

  function failure(status: number, what: string): MarketError {
    return new MarketError(`the marketplace refused to ${what} (HTTP ${status})`, false);
  }

  return {
    async cheapestOffer() {
      const query = {
        verified: { eq: true },
        external: { eq: false },
        rentable: { eq: true },
        rented: { eq: false },
        type: 'on-demand',
        num_gpus: { eq: 1 },
        gpu_ram: { gte: market.minGpuRamMb },
        reliability: { gte: market.minReliability },
        cuda_max_good: { gte: 12.1 },
        order: [['dph_total', 'asc']],
        allocated_storage: market.diskGb,
        limit: 20,
      };
      const { status, json } = await call('POST', '/api/v0/bundles/', query);
      if (status !== 200) throw failure(status, 'search for machines');
      const offers = (json as { offers?: unknown } | null)?.offers;
      if (!Array.isArray(offers)) return null;
      for (const row of offers as OfferRow[]) {
        const price = micros(row.dph_total);
        const id = typeof row.id === 'number' || typeof row.id === 'string' ? String(row.id) : null;
        const gpu = short(row.gpu_name);
        const vramMb = typeof row.gpu_ram === 'number' ? Math.round(row.gpu_ram) : null;
        if (id === null || gpu === null || vramMb === null || price === null) continue;
        if (price > market.maxUsdPerHourMicros) return null;
        return { id, gpu, vramMb, usdPerHourMicros: price };
      }
      return null;
    },

    async launch(request) {
      if (!/^\d{1,20}$/.test(request.offerId)) throw new MarketError('the offer id is not a number', false);
      const { status, json } = await call('PUT', `/api/v0/asks/${request.offerId}/`, {
        client_id: 'me',
        image: market.image,
        disk: market.diskGb,
        label: request.label,
        onstart: request.onstart,
        runtype: 'ssh',
        cancel_unavail: true,
        target_state: 'running',
      });
      if (status === 404 || status === 410) return null;
      const contract = (json as { new_contract?: unknown } | null)?.new_contract;
      if (status !== 200 || (typeof contract !== 'number' && typeof contract !== 'string')) {
        throw failure(status, 'rent the machine');
      }
      return String(contract);
    },

    async machine(instanceId) {
      const { status, json } = await call('GET', `/api/v0/instances/${encodeURIComponent(instanceId)}/?owner=me`);
      if (status === 404) return { state: 'gone', message: null };
      if (status !== 200) throw failure(status, 'show the machine');
      const row = (json as { instances?: InstanceRow | null } | null)?.instances ?? null;
      if (row === null) return { state: 'gone', message: null };
      const message = short(row.status_msg);
      if (READY.has(String(row.actual_status))) return { state: 'running', message };
      if (LOADING.has(row.actual_status as string | null | undefined)) return { state: 'starting', message };
      return { state: 'failed', message };
    },

    async destroy(instanceId) {
      const { status } = await call('DELETE', `/api/v0/instances/${encodeURIComponent(instanceId)}/`, {});
      if (status !== 200 && status !== 404) throw failure(status, 'destroy the machine');
    },

    async labelled(prefix) {
      const found: { instanceId: string; label: string }[] = [];
      let after: string | null = null;
      for (let page = 0; page < 20; page += 1) {
        const params = new URLSearchParams({ limit: '25' });
        if (after !== null) params.set('after_token', after);
        const { status, json } = await call('GET', `/api/v1/instances/?${params.toString()}`);
        if (status !== 200) throw failure(status, 'list the machines');
        const body = json as { instances?: unknown; next_token?: unknown } | null;
        for (const row of Array.isArray(body?.instances) ? (body.instances as InstanceRow[]) : []) {
          if (typeof row.label === 'string' && row.label.startsWith(prefix) && row.id !== undefined) {
            found.push({ instanceId: String(row.id), label: row.label });
          }
        }
        after = typeof body?.next_token === 'string' && body.next_token !== '' ? body.next_token : null;
        if (after === null) break;
      }
      return found;
    },
  };
}
