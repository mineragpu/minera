/**
 * Sentinel's limits. The speed floor depends on the network's model and is set per deployment in
 * the configuration; everything else is fixed here.
 */
export const SENTINEL_POLICY = {
  /** Canaries a rig on probation must pass, without a strike between them, to be trusted. */
  probationCanaries: 5,
  /** Share of verified units a rig on probation is paid for, in basis points. */
  probationPayBps: 5_000,
  /** Strikes inside the window that put a rig in quarantine, and how long quarantine lasts. */
  strikesToQuarantine: 3,
  strikeWindowSeconds: 86_400,
  quarantineSeconds: 3_600,
  /** Mean seconds between canaries per standing. Each interval is drawn at random around it. */
  canaryMeanSeconds: { probation: 300, trusted: 900 },
  canaryMinSeconds: 60,
  canaryMaxSeconds: 3_600,
  /**
   * Leading characters of the agreed answer a canary result must reproduce. Seeds and canaries use
   * the playground's settings so a node cannot single them out, and honest rigs on different cards
   * agree most reliably at the start of an answer.
   */
  canaryPrefixChars: 64,
  /** Disputes after which a canary that no third rig has confirmed is retired. */
  canaryRetireDisputes: 2,
  /** Canaries kept per model; seeding stops at the target and keeps a few seed pairs in flight. */
  bankSize: 200,
  bankTarget: 60,
  seedsInFlight: 2,
  seedTtlSeconds: 600,
  /** How long a disagreement waits for a third rig before both answers count as unverified. */
  tiebreakTtlSeconds: 300,
  /** Speed samples kept per rig, how many it takes to decide, and the shortest answer timed. */
  speedSamples: 8,
  speedDecidingSamples: 3,
  speedMinUnits: 32,
  /** Signed requests allowed per node key per minute, and the pause required between hellos. */
  requestsPerMinute: 60,
  helloCooldownSeconds: 60,
  /** How long gate tallies and strikes are kept. */
  retentionSeconds: 7 * 86_400,
} as const;
