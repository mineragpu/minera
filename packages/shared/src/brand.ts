/**
 * Every user-visible name, symbol and link the project uses.
 *
 * Nothing else in the codebase hard-codes the name, the ticker or a URL, so the identity can be
 * changed here without touching anything else.
 */
export const BRAND = {
  name: 'DayaGPU',
  symbol: 'DAYA',
  pronunciation: 'DAH-yah G-P-U',
  meaning: 'Daya means power.',
  tagline: "Deploy a GPU like you'd launch a token.",
  oneLiner:
    'A GPU launchpad for mining. Deploy your card, pair its rewards with ETH or a tokenized ' +
    'stock, and mine from a pool that only fills.',
  links: {
    site: 'https://web-production-360d4.up.railway.app',
    x: 'https://x.com/dayagpu',
    github: 'https://github.com/dayagpu/dayagpu',
  },
} as const;

/**
 * Product vocabulary. One set of words across the site, the docs, the API and the logs.
 */
export const LEXICON = {
  /** A GPU registered to the network and able to take work. */
  rig: 'rig',
  /** Registering a rig: the launchpad moment. */
  deploy: 'deploy',
  /** The asset a rig's rewards are paid in. */
  pair: 'pair',
  /** A one-way deposit into the pool. */
  burn: 'burn',
  /** The pool rewards are paid from. It has no withdraw function. */
  pool: 'Burn Pool',
  /** One settlement period of verified work. */
  block: 'block',
  /** An announced period with its own share of creator fees burned to the pool. */
  campaign: 'campaign',
  /** Bonding tokens behind a rig. */
  back: 'back',
} as const;

export type Brand = typeof BRAND;
