import { formatNumber } from '../../lib/format.ts';

/** The scale beside the vessel runs to this many slabs; deposits fill at most `FILL_SLABS`. */
export const SCALE_SLABS = 18;
const FILL_SLABS = 16;
/** Smaller deposits show as a sliver of one slab rather than a unit nobody can read. */
const SMALLEST_UNIT_ETH = 0.001;
const STEPS = [1, 2, 5] as const;

/** ETH per slab: the smallest 1-2-5 step that fits every deposit on the scale. */
export function slabUnit(depositedEth: number): number {
  if (!(depositedEth > 0)) return 1;
  let exponent = Math.floor(Math.log10(depositedEth / FILL_SLABS));
  for (;;) {
    for (const step of STEPS) {
      const unit = Math.max(SMALLEST_UNIT_ETH, step * 10 ** exponent);
      if (depositedEth / unit <= FILL_SLABS) return unit;
    }
    exponent += 1;
  }
}

/** A scale value in ETH with as many decimals as the unit needs. */
export function formatScale(eth: number, unit: number): string {
  return formatNumber(eth, Math.max(0, -Math.floor(Math.log10(unit))));
}
