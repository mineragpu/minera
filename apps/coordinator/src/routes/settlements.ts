import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { Hex } from '@dayagpu/shared';
import type { TreeDump } from '../store/records.ts';
import type { RouteContext } from './context.ts';
import { ApiError } from './errors.ts';
import { settlementSummary, type SettlementSummary } from './format.ts';
import { parse } from './validate.ts';

const HOW_TO_VERIFY =
  'Rebuilding `tree` must give `root`: each leaf is keccak256(keccak256(abi.encode(address account, uint256 ' +
  'cumulative))) and pairs are hashed sorted. `inputsDigest`, published on-chain with the root, is keccak256 of ' +
  'the UTF-8 bytes of `inputsJson`, which lists the budget, the verified work per rig and every allocation.';

export interface SettlementDetail extends SettlementSummary {
  inputsDigest: Hex | null;
  /** The inputs document byte for byte as hashed; `null` for a settlement this service did not build. */
  inputsJson: string | null;
  inputs: unknown;
  tree: TreeDump | null;
  howToVerify: string;
}

export function registerSettlementRoute(app: FastifyInstance, context: RouteContext): void {
  app.get('/v1/settlements/:index', async (request): Promise<SettlementDetail> => {
    const { index } = parse(
      z.object({ index: z.coerce.number().int().min(1).max(Number.MAX_SAFE_INTEGER) }),
      request.params,
      'params',
    );
    const settlement = await context.store.settlements.byIndex(index);
    if (!settlement) {
      throw new ApiError(404, 'settlement_not_found', 'There is no published settlement with this index.');
    }
    return {
      ...settlementSummary(settlement),
      inputsDigest: settlement.inputsDigest,
      inputsJson: settlement.inputs,
      inputs: settlement.inputs === null ? null : JSON.parse(settlement.inputs),
      tree: settlement.dump,
      howToVerify: HOW_TO_VERIFY,
    };
  });
}
