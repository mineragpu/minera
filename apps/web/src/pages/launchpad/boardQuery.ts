import type { PairAsset } from '@dayagpu/shared';
import type { RigQuery, RigSort } from '../../api/coordinator.ts';
import { PAIR_LISTING } from '../../config/contracts.ts';
import { PATHS } from '../../router/routes.ts';

/** Rigs per page: fills three, two or one column evenly, well under the coordinator's cap of 100. */
export const PAGE_SIZE = 24;

/** The coordinator refuses offsets past 100,000. */
const LAST_PAGE = Math.floor(100_000 / PAGE_SIZE) + 1;

export const SORTS: readonly { value: RigSort; label: string }[] = [
  { value: 'new', label: 'New' },
  { value: 'epoch', label: 'Top this epoch' },
  { value: 'top', label: 'Lifetime' },
];

/** What the board shows. It lives in the address query, so a board view can be linked. */
export interface BoardState {
  /** Null shows every pair. */
  pair: PairAsset | null;
  sort: RigSort;
  /** Counted from one. */
  page: number;
}

function pairParam(asset: PairAsset): string {
  return asset.symbol.toLowerCase();
}

function readPair(value: string | null): PairAsset | null {
  if (!value) return null;
  const wanted = value.toLowerCase();
  return (
    PAIR_LISTING.assets.find((asset) => pairParam(asset) === wanted || asset.address.toLowerCase() === wanted) ?? null
  );
}

function readSort(value: string | null): RigSort {
  return SORTS.find((option) => option.value === value)?.value ?? 'new';
}

function readPage(value: string | null): number {
  const page = value && /^\d+$/.test(value) ? Number(value) : 1;
  return Math.min(Math.max(page, 1), LAST_PAGE);
}

/** Unknown or malformed values fall back to the default view rather than an error. */
export function readBoardState(search: string): BoardState {
  const params = new URLSearchParams(search);
  return { pair: readPair(params.get('pair')), sort: readSort(params.get('sort')), page: readPage(params.get('page')) };
}

/** The launchpad address for `state`; defaults are left out, so the plain board stays `/launchpad`. */
export function boardHref(state: BoardState): string {
  const params = new URLSearchParams();
  if (state.pair) params.set('pair', pairParam(state.pair));
  if (state.sort !== 'new') params.set('sort', state.sort);
  if (state.page > 1) params.set('page', String(state.page));
  const query = params.toString();
  return query ? `${PATHS.launchpad}?${query}` : PATHS.launchpad;
}

export function rigQueryFor(state: BoardState): RigQuery {
  let pair: RigQuery['pair'] = null;
  if (state.pair) pair = state.pair.kind === 'native' ? 'eth' : state.pair.address;
  return { sort: state.sort, pair, limit: PAGE_SIZE, offset: (state.page - 1) * PAGE_SIZE };
}
