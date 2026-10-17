/**
 * The labels of the campaigns. Their burns are real and carry the campaign id on chain; the
 * figures shown for them are read live.
 */

export const PREVIEW_CAMPAIGN = {
  number: '01',
  name: 'Genesis',
} as const;

/** Campaign 2 runs on mainnet only: the daily top-ups from the refill wallet. */
export const REFILL_CAMPAIGN = {
  number: '02',
  name: 'Daily refill',
} as const;
