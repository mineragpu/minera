/**
 * Example figures shown until the network is live. Nothing here is read from the chain or the
 * coordinator, so every group that renders these carries a visible "Preview data" tag.
 */

export type Pair = 'eth' | 'stock';

export const PREVIEW_CAMPAIGN = {
  number: '01',
  name: 'Genesis',
  /** Share of creator fees burned to the pool. */
  poolSharePercent: 40,
} as const;

export const PREVIEW_DEPLOY = {
  rigName: 'Night Shift',
  bond: '2,500',
  vramGb: 24,
  fp16Tflops: 82.6,
} as const;
