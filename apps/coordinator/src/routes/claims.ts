import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { Address, Hex } from '@minera/shared';
import type { RouteContext } from './context.ts';
import { iso } from './format.ts';
import { addressSchema, parse } from './validate.ts';

interface ClaimView {
  account: Address;
  /** Cumulative entitlement in the newest claimable settlement, in wei. */
  cumulative: string;
  /** Everything already claimed, summed from the pool's Claimed events, in wei. */
  claimed: string;
  claimable: string;
  /** The settlement `proof` belongs to; pass its index, the cumulative amount and the proof to the claim call. */
  settlement: { index: number; root: Hex; claimableAt: string | null } | null;
  proof: Hex[];
  /** A newer settlement still inside its challenge delay, and what it would make claimable. */
  pending: { index: number; cumulative: string; claimableAt: string | null } | null;
}

export function registerClaimRoute(app: FastifyInstance, context: RouteContext): void {
  const { store, clock } = context;

  app.get('/v1/claims/:account', async (request): Promise<ClaimView> => {
    const { account } = parse(z.object({ account: addressSchema }), request.params, 'params');
    const now = clock();
    const [settlement, pending, claimed] = await Promise.all([
      store.settlements.latestClaimable(now),
      store.settlements.latestPending(now),
      store.chain.claimedBy(account),
    ]);
    const entitlement = settlement ? await store.settlements.entitlement(settlement.id, account) : null;
    const upcoming = pending ? await store.settlements.entitlement(pending.id, account) : null;
    const cumulative = entitlement?.cumulative ?? 0n;
    return {
      account,
      cumulative: cumulative.toString(),
      claimed: claimed.toString(),
      claimable: (cumulative > claimed ? cumulative - claimed : 0n).toString(),
      settlement:
        settlement && settlement.index !== null
          ? { index: settlement.index, root: settlement.root, claimableAt: iso(settlement.claimableAt) }
          : null,
      proof: entitlement?.proof ?? [],
      pending:
        pending && pending.index !== null && upcoming
          ? { index: pending.index, cumulative: upcoming.cumulative.toString(), claimableAt: iso(pending.claimableAt) }
          : null,
    };
  });
}
