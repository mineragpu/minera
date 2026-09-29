import type { SettlementRecord } from '../records.ts';
import type { SettlementStore } from '../store.ts';
import { copy, type StateBox } from './state.ts';

export function memorySettlements(box: StateBox): SettlementStore {
  const all = (): SettlementRecord[] => [...box.state.settlements.values()];
  const find = (id: number): SettlementRecord => {
    const row = box.state.settlements.get(id);
    if (!row) throw new Error(`unknown settlement ${id}`);
    return row;
  };
  const live = (row: SettlementRecord): boolean => row.status === 'published' && row.index !== null && !row.vetoed;
  const newestIndex = (rows: SettlementRecord[]): SettlementRecord | null =>
    rows.sort((a, b) => (b.index ?? 0) - (a.index ?? 0))[0] ?? null;

  return {
    async createDraft(draft) {
      const id = box.state.nextSettlementId++;
      box.state.settlements.set(id, {
        id,
        index: null,
        status: 'sending',
        vetoed: false,
        root: draft.root,
        total: draft.total,
        inputsDigest: draft.inputsDigest,
        inputs: draft.inputs,
        dump: copy(draft.dump),
        previousIndex: draft.previousIndex,
        fromEpoch: draft.fromEpoch,
        toEpoch: draft.toEpoch,
        txHash: null,
        blockNumber: null,
        publishedAt: null,
        claimableAt: null,
        error: null,
        createdAt: draft.createdAt,
      });
      box.state.entitlements.set(id, copy(draft.entitlements));
      return id;
    },

    async markSent(id, txHash) {
      const row = find(id);
      row.status = 'sent';
      row.txHash = txHash;
    },

    async markFailed(id, error) {
      const row = find(id);
      row.status = 'failed';
      row.error = error;
    },

    async recordPublished(published) {
      let row =
        all().find((candidate) => candidate.index === published.index) ??
        all()
          .filter(
            (candidate) =>
              candidate.index === null &&
              candidate.root === published.root &&
              candidate.inputsDigest === published.inputsDigest,
          )
          .sort((a, b) => b.id - a.id)[0];
      if (!row) {
        const id = box.state.nextSettlementId++;
        row = {
          id,
          index: null,
          status: 'published',
          vetoed: false,
          root: published.root,
          total: published.total,
          inputsDigest: published.inputsDigest,
          inputs: null,
          dump: null,
          previousIndex: null,
          fromEpoch: null,
          toEpoch: null,
          txHash: null,
          blockNumber: null,
          publishedAt: null,
          claimableAt: null,
          error: null,
          createdAt: published.publishedAt,
        };
        box.state.settlements.set(id, row);
      }
      Object.assign(row, {
        index: published.index,
        status: 'published',
        root: published.root,
        total: published.total,
        inputsDigest: published.inputsDigest,
        txHash: published.txHash,
        blockNumber: published.blockNumber,
        publishedAt: published.publishedAt,
        claimableAt: published.claimableAt,
        error: null,
      });
    },

    async markVetoed(index) {
      const row = all().find((candidate) => candidate.index === index);
      if (row) row.vetoed = true;
    },

    async open() {
      return all()
        .filter((row) => row.status === 'sending' || row.status === 'sent')
        .sort((a, b) => a.id - b.id)
        .map(copy);
    },

    async byIndex(index) {
      const row = all().find((candidate) => candidate.index === index);
      return row ? copy(row) : null;
    },

    async recent(limit) {
      return all()
        .filter((row) => row.index !== null)
        .sort((a, b) => (b.index ?? 0) - (a.index ?? 0))
        .slice(0, limit)
        .map(copy);
    },

    async entitlements(settlementId) {
      return copy(box.state.entitlements.get(settlementId) ?? []);
    },

    async entitlement(settlementId, account) {
      const found = box.state.entitlements.get(settlementId)?.find((entry) => entry.account === account);
      return found ? copy(found) : null;
    },

    async latestClaimable(now) {
      const row = newestIndex(all().filter((row) => live(row) && row.claimableAt !== null && row.claimableAt <= now));
      return row ? copy(row) : null;
    },

    async latestPending(now) {
      const row = newestIndex(all().filter((row) => live(row) && row.claimableAt !== null && row.claimableAt > now));
      return row ? copy(row) : null;
    },
  };
}
