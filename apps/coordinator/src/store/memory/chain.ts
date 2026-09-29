import type { BurnRecord, CampaignSummary, LogPosition } from '../records.ts';
import type { ChainStore } from '../store.ts';
import { copy, type StateBox } from './state.ts';

function samePosition(a: LogPosition, b: LogPosition): boolean {
  return a.txHash === b.txHash && a.logIndex === b.logIndex;
}

function newestFirst(a: LogPosition, b: LogPosition): number {
  return a.blockNumber === b.blockNumber ? b.logIndex - a.logIndex : a.blockNumber > b.blockNumber ? -1 : 1;
}

export function memoryChain(box: StateBox): ChainStore {
  return {
    async cursor() {
      return box.state.cursor;
    },

    async setCursor(block) {
      box.state.cursor = block;
    },

    async addBurn(burn) {
      if (!box.state.burns.some((known) => samePosition(known, burn))) box.state.burns.push(copy(burn));
    },

    async addClaim(claim) {
      if (!box.state.claims.some((known) => samePosition(known, claim))) box.state.claims.push(copy(claim));
    },

    async recentBurns(limit) {
      return [...box.state.burns].sort(newestFirst).slice(0, limit).map(copy);
    },

    async currentCampaign() {
      const newest = [...box.state.burns].sort(newestFirst).find((burn) => burn.campaignId > 0n);
      if (!newest) return null;
      const burns: BurnRecord[] = box.state.burns.filter((burn) => burn.campaignId === newest.campaignId);
      const times = burns.map((burn) => burn.blockTime.getTime());
      const summary: CampaignSummary = {
        campaignId: newest.campaignId,
        memo: newest.memo,
        burned: burns.reduce((sum, burn) => sum + burn.amount, 0n),
        burns: burns.length,
        firstBurnAt: new Date(Math.min(...times)),
        lastBurnAt: new Date(Math.max(...times)),
      };
      return summary;
    },

    async claimedBy(account) {
      return box.state.claims
        .filter((claim) => claim.account === account)
        .reduce((sum, claim) => sum + claim.amount, 0n);
    },
  };
}
