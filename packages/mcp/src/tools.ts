/**
 * The tools the server offers. Every one is a read: it maps validated arguments onto one GET route
 * of the coordinator's public API and returns what the coordinator answered.
 */

import { z } from 'zod';
import type { MineraApi } from './api.ts';

export interface Tool {
  name: string;
  title: string;
  description: string;
  input: z.ZodObject;
  read(api: MineraApi, args: Record<string, unknown>): Promise<unknown>;
}

const ADDRESS = /^0x[0-9a-fA-F]{40}$/;

export const TOOLS: readonly Tool[] = [
  {
    name: 'minera_network',
    title: 'Network summary',
    description:
      'A live summary of the Minera network: rigs and how many are online, verified work and jobs in the last 24 hours, the Burn Pool, the current campaign and epoch, and the model open jobs use.',
    input: z.object({}),
    read: (api) => api.get('/v1/network'),
  },
  {
    name: 'minera_rigs',
    title: 'Rigs on the launchpad',
    description:
      'Rigs on the launchpad with their standing and verified work. Sort by newest, most lifetime verified work, or most verified work this epoch.',
    input: z.object({
      sort: z.enum(['new', 'top', 'epoch']).optional().describe('new (default), top or epoch'),
      limit: z.number().int().min(1).max(100).optional().describe('1 to 100, default 50'),
      offset: z.number().int().min(0).max(100_000).optional(),
    }),
    read: (api, args) =>
      api.get('/v1/rigs', {
        sort: args['sort'] as string | undefined,
        limit: args['limit'] as number | undefined,
        offset: args['offset'] as number | undefined,
      }),
  },
  {
    name: 'minera_rig',
    title: 'One rig',
    description: "One rig by its node address: operator, pair, standing, verified work and its check record.",
    input: z.object({ nodeAddress: z.string().regex(ADDRESS).describe('The rig\'s node address, 0x and 40 hex characters') }),
    read: (api, args) => api.get(`/v1/rigs/${args['nodeAddress'] as string}`),
  },
  {
    name: 'minera_pool',
    title: 'Burn Pool',
    description:
      "The Burn Pool's state (total burned, committed, releasable, challenge delay, release rate), the current campaign, and the most recent burns and settlements.",
    input: z.object({}),
    read: (api) => api.get('/v1/pool'),
  },
  {
    name: 'minera_settlement',
    title: 'One settlement',
    description:
      'One settlement by index: its root, total, inputs document and digest, and the full tree, so the split can be checked.',
    input: z.object({ index: z.number().int().min(0).describe('The settlement index, from 0') }),
    read: (api, args) => api.get(`/v1/settlements/${args['index'] as number}`),
  },
  {
    name: 'minera_claims',
    title: 'Claims of one wallet',
    description: "What one operator wallet has earned to date, claimed, and can claim now, with the proof to claim it.",
    input: z.object({ account: z.string().regex(ADDRESS).describe('The operator wallet, 0x and 40 hex characters') }),
    read: (api, args) => api.get(`/v1/claims/${args['account'] as string}`),
  },
  {
    name: 'minera_sentinel',
    title: 'Sentinel',
    description: "Sentinel's published counts: rigs by standing and what each of the five gates passed and stopped.",
    input: z.object({}),
    read: (api) => api.get('/v1/sentinel'),
  },
];

export function findTool(name: string): Tool | undefined {
  return TOOLS.find((tool) => tool.name === name);
}
