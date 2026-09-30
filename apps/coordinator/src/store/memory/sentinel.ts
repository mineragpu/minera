import { SENTINEL_GATES } from '@minera/shared';
import type { CanaryRecord } from '../records.ts';
import type { SentinelStore } from '../store.ts';
import { copy, type StateBox } from './state.ts';

const MINUTE_MS = 60_000;

export function memorySentinel(box: StateBox): SentinelStore {
  const find = (id: string): CanaryRecord | undefined => box.state.canaries.get(id);
  const byAge = (a: CanaryRecord, b: CanaryRecord): number =>
    a.createdAt.getTime() - b.createdAt.getTime() || (a.id < b.id ? -1 : 1);

  return {
    async tally(gate, outcome, at) {
      const key = `${Math.floor(at.getTime() / MINUTE_MS) * MINUTE_MS}|${gate}|${outcome}`;
      box.state.tally.set(key, (box.state.tally.get(key) ?? 0) + 1);
    },

    async gateCounts(since) {
      const counts = new Map(SENTINEL_GATES.map((gate) => [gate, { gate, passed: 0, blocked: 0 }]));
      for (const [key, count] of box.state.tally) {
        const [minute, gate, outcome] = key.split('|');
        const entry = counts.get(gate as (typeof SENTINEL_GATES)[number]);
        if (!entry || Number(minute) < Math.floor(since.getTime() / MINUTE_MS) * MINUTE_MS) continue;
        if (outcome === 'passed') entry.passed += count;
        else entry.blocked += count;
      }
      return [...counts.values()];
    },

    async strike(nodeKey, reason, at) {
      box.state.strikes.push({ nodeKey, reason, at });
    },

    async strikesSince(nodeKey, since) {
      return box.state.strikes.filter((strike) => strike.nodeKey === nodeKey && strike.at >= since).length;
    },

    async quarantine(nodeKey, epochs) {
      for (const epoch of epochs) box.state.quarantines.add(`${nodeKey}:${epoch}`);
    },

    async addCanary(canary) {
      box.state.canaries.set(canary.id, { ...copy(canary), servedTo: [], confirmations: 0, disputes: 0 });
    },

    async getCanary(id) {
      const canary = find(id);
      return canary ? copy(canary) : null;
    },

    async pickCanary(model, nodeKey, random) {
      const eligible = [...box.state.canaries.values()]
        .filter(
          (canary) =>
            canary.model === model && !canary.sources.includes(nodeKey) && !canary.servedTo.includes(nodeKey),
        )
        .sort(byAge);
      if (eligible.length === 0) return null;
      return copy(eligible[random.int(eligible.length)] ?? null);
    },

    async markServed(id, nodeKey) {
      const canary = find(id);
      if (canary && !canary.servedTo.includes(nodeKey)) canary.servedTo.push(nodeKey);
    },

    async confirm(id) {
      const canary = find(id);
      if (canary) canary.confirmations += 1;
    },

    async dispute(id) {
      const canary = find(id);
      if (canary) canary.disputes += 1;
    },

    async retire(id) {
      box.state.canaries.delete(id);
    },

    async canaryCount(model) {
      return [...box.state.canaries.values()].filter((canary) => canary.model === model).length;
    },

    async prune(before, bankSize) {
      const cutoff = Math.floor(before.getTime() / MINUTE_MS) * MINUTE_MS;
      for (const key of box.state.tally.keys()) {
        if (Number(key.split('|')[0]) < cutoff) box.state.tally.delete(key);
      }
      box.state.strikes = box.state.strikes.filter((strike) => strike.at >= before);
      const models = new Map<string, CanaryRecord[]>();
      for (const canary of box.state.canaries.values()) {
        models.set(canary.model, [...(models.get(canary.model) ?? []), canary]);
      }
      for (const canaries of models.values()) {
        const excess = canaries.sort(byAge).slice(0, Math.max(0, canaries.length - bankSize));
        for (const canary of excess) box.state.canaries.delete(canary.id);
      }
    },
  };
}
