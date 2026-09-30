import type { Address, RigStanding } from '@minera/shared';
import { epochOf } from '../epoch.ts';
import type { RigRecord, StrikeReason } from '../store/records.ts';
import type { Store } from '../store/store.ts';
import { SENTINEL_POLICY } from './policy.ts';

const BPS = 10_000;

/** Units a rig is paid for verified work at its standing. */
export function paidUnits(standing: RigStanding, units: number): number {
  switch (standing) {
    case 'trusted':
      return units;
    case 'probation':
      return Math.floor((units * SENTINEL_POLICY.probationPayBps) / BPS);
    case 'quarantined':
      return 0;
  }
}

function epochsBetween(from: Date, to: Date, epochSeconds: number): number[] {
  const epochs: number[] = [];
  for (let epoch = epochOf(from, epochSeconds); epoch <= epochOf(to, epochSeconds); epoch += 1) epochs.push(epoch);
  return epochs;
}

/** Lift a quarantine that has run out. The rig comes back on probation and starts its count over. */
export async function refreshStanding(tx: Store, rig: RigRecord, now: Date): Promise<RigRecord> {
  if (rig.standing !== 'quarantined' || rig.quarantinedUntil === null || rig.quarantinedUntil > now) return rig;
  const patch = { standing: 'probation', canariesPassed: 0, quarantinedUntil: null } as const;
  await tx.rigs.updateSentinel(rig.nodeKey, patch);
  return { ...rig, ...patch };
}

/**
 * Record a strike. A strike resets a probation count, and enough strikes inside the window put
 * the rig in quarantine: no work until it ends, and nothing earned in any epoch it touches.
 */
export async function strike(
  tx: Store,
  nodeKey: Address,
  reason: StrikeReason,
  now: Date,
  epochSeconds: number,
): Promise<void> {
  await tx.sentinel.strike(nodeKey, reason, now);
  const rig = await tx.rigs.get(nodeKey);
  if (!rig || rig.standing === 'quarantined') return;
  const since = new Date(now.getTime() - SENTINEL_POLICY.strikeWindowSeconds * 1000);
  if ((await tx.sentinel.strikesSince(nodeKey, since)) < SENTINEL_POLICY.strikesToQuarantine) {
    if (rig.standing === 'probation' && rig.canariesPassed > 0) {
      await tx.rigs.updateSentinel(nodeKey, { canariesPassed: 0 });
    }
    return;
  }
  const until = new Date(now.getTime() + SENTINEL_POLICY.quarantineSeconds * 1000);
  await tx.rigs.updateSentinel(nodeKey, { standing: 'quarantined', quarantinedUntil: until, canariesPassed: 0 });
  await tx.sentinel.quarantine(nodeKey, epochsBetween(now, until, epochSeconds));
  await tx.sentinel.tally('reputation', 'blocked', now);
}

/** Count a passed canary, and trust a rig on probation once it has passed enough of them. */
export async function passCanary(tx: Store, nodeKey: Address, now: Date): Promise<void> {
  const rig = await tx.rigs.get(nodeKey);
  if (!rig) return;
  const canariesPassed = rig.canariesPassed + 1;
  if (rig.standing === 'probation' && canariesPassed >= SENTINEL_POLICY.probationCanaries) {
    await tx.rigs.updateSentinel(nodeKey, { standing: 'trusted', canariesPassed });
    await tx.sentinel.tally('reputation', 'passed', now);
    return;
  }
  await tx.rigs.updateSentinel(nodeKey, { canariesPassed });
}
