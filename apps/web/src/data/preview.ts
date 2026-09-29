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

export const PREVIEW_POOL = {
  /** ETH still in the pool. */
  balanceEth: 12.84,
  /** ETH paid out to miners so far. */
  paidEth: 3.91,
  /** Every deposit ever burned in: balance plus paid. */
  depositedEth: 16.75,
  depositCount: 214,
} as const;

export interface RigPreview {
  readonly id: string;
  readonly name: string;
  readonly deployedDaysAgo: number;
  readonly pair: Pair;
  /** Accent for the card's sparkline, as a CSS colour. */
  readonly hue: string;
  /** Tint of the card's cube glyph, as a CSS colour. */
  readonly glyph: string;
  readonly vramGb: number;
  readonly verifiedUnits: number;
  /** Earned this campaign, in the rig's pair, as displayed. */
  readonly earned: string;
  readonly uptimePercent: number;
  readonly backers: number;
  /** Hourly uptime, oldest first, in percent. */
  readonly uptimeHourly: readonly number[];
}

export const PREVIEW_RIGS: readonly RigPreview[] = [
  {
    id: 'night-shift',
    name: 'Night Shift',
    deployedDaysAgo: 12,
    pair: 'eth',
    hue: 'var(--teal)',
    glyph: 'var(--teal)',
    vramGb: 24,
    verifiedUnits: 18420,
    earned: '0.412',
    uptimePercent: 99.2,
    backers: 38,
    uptimeHourly: [100, 100, 100, 100, 96, 100, 100, 100, 100, 100, 98, 100, 100, 100, 100, 94, 100, 100, 100, 100, 100, 100, 93, 100],
  },
  {
    id: 'deep-seam',
    name: 'Deep Seam',
    deployedDaysAgo: 19,
    pair: 'stock',
    hue: 'var(--violet)',
    glyph: 'var(--violet)',
    vramGb: 48,
    verifiedUnits: 31906,
    earned: '3.18',
    uptimePercent: 99.7,
    backers: 61,
    uptimeHourly: [100, 100, 100, 100, 100, 100, 100, 100, 100, 95, 100, 100, 100, 100, 100, 100, 100, 100, 98, 100, 100, 100, 100, 100],
  },
  {
    id: 'kiln-07',
    name: 'Kiln-07',
    deployedDaysAgo: 9,
    pair: 'eth',
    hue: 'var(--gold)',
    glyph: 'var(--gold)',
    vramGb: 24,
    verifiedUnits: 12775,
    earned: '0.286',
    uptimePercent: 97.9,
    backers: 22,
    uptimeHourly: [100, 96, 100, 100, 88, 100, 100, 97, 100, 100, 90, 100, 100, 94, 100, 100, 100, 92, 100, 100, 95, 100, 98, 100],
  },
  {
    id: 'basement-rig',
    name: 'Basement Rig',
    deployedDaysAgo: 6,
    pair: 'eth',
    hue: 'var(--magenta)',
    glyph: 'var(--magenta)',
    vramGb: 12,
    verifiedUnits: 6140,
    earned: '0.137',
    uptimePercent: 94.6,
    backers: 9,
    uptimeHourly: [100, 100, 98, 100, 60, 70, 85, 100, 100, 96, 100, 92, 100, 100, 94, 100, 90, 100, 97, 100, 95, 100, 94, 100],
  },
  {
    id: 'tin-road',
    name: 'Tin Road',
    deployedDaysAgo: 8,
    pair: 'stock',
    hue: 'var(--blue)',
    glyph: 'var(--blue)',
    vramGb: 16,
    verifiedUnits: 9882,
    earned: '0.96',
    uptimePercent: 98.8,
    backers: 17,
    uptimeHourly: [100, 100, 100, 97, 100, 100, 90, 100, 100, 100, 100, 95, 100, 100, 100, 96, 100, 100, 100, 94, 100, 100, 100, 100],
  },
  {
    id: 'aurora-3',
    name: 'Aurora-3',
    deployedDaysAgo: 21,
    pair: 'eth',
    hue: 'var(--teal)',
    glyph: 'var(--ice)',
    vramGb: 32,
    verifiedUnits: 44310,
    earned: '0.991',
    uptimePercent: 99.9,
    backers: 104,
    uptimeHourly: [100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 98, 100, 100, 100, 100, 100, 100, 100, 100, 100],
  },
];

export const PREVIEW_DEPLOY = {
  rigName: 'Night Shift',
  bond: '2,500',
  vramGb: 24,
  fp16Tflops: 82.6,
} as const;
