/**
 * Campaign figures that are not decided yet. Nothing here is read from the chain or the
 * coordinator, so every group that renders these carries a visible "Preview data" tag.
 */

export const PREVIEW_CAMPAIGN = {
  number: '01',
  name: 'Genesis',
  /** Share of creator fees burned to the pool. */
  poolSharePercent: 40,
} as const;
