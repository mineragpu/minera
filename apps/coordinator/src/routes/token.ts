import type { FastifyInstance, FastifyReply } from 'fastify';
import { TOKEN } from '@minera/shared';
import { formatUnits } from 'viem';
import type { TokenSupplySnapshot } from '../chain/token.ts';
import type { RouteContext } from './context.ts';
import { ApiError } from './errors.ts';
import { unixIso } from './format.ts';

interface TokenSupplyView {
  symbol: string;
  address: string;
  chainId: number;
  decimals: number;
  maxSupply: string;
  totalSupply: string;
  circulatingSupply: string;
  burned: string;
  burnAddresses: string[];
  nonCirculating: { address: string; label: string; balance: string }[];
  asOf: { block: string; time: string };
  rules: { totalSupply: string; circulatingSupply: string };
}

const RULES = {
  totalSupply: 'Everything minted, less what the burn addresses hold.',
  circulatingSupply: 'The total supply, less what the non-circulating wallets hold.',
} as const;

/** The supply in whole tokens, as plain decimal strings. */
function supplyFigures(snapshot: TokenSupplySnapshot, decimals: number) {
  const total = snapshot.minted - snapshot.burned;
  const held = snapshot.held.reduce((sum, wallet) => sum + wallet.balance, 0n);
  return {
    total: formatUnits(total, decimals),
    circulating: formatUnits(total - held, decimals),
    burned: formatUnits(snapshot.burned, decimals),
  };
}

/**
 * The token's supply, read from the chain at one block, for listing sites and anyone checking the
 * figures. Served only by the coordinator of the network the token lives on.
 */
export function registerTokenRoutes(app: FastifyInstance, context: RouteContext): void {
  const rules = TOKEN.supply;
  const here = rules !== null && TOKEN.address !== null && rules.chainId === context.config.chain.id;

  function snapshot(): TokenSupplySnapshot {
    if (!here) throw new ApiError(404, 'token_not_on_network', `$${TOKEN.symbol} does not live on this network.`);
    const current = context.token?.current() ?? null;
    if (!current) throw new ApiError(503, 'not_ready', "The token's supply has not been read from the chain yet. Try again in a minute.");
    return current;
  }

  const plain = (reply: FastifyReply, value: string) => reply.type('text/plain; charset=utf-8').send(value);

  app.get('/v1/token', async (): Promise<TokenSupplyView> => {
    const current = snapshot();
    const { decimals, maxSupply, burnAddresses } = rules!;
    const figures = supplyFigures(current, decimals);
    return {
      symbol: TOKEN.symbol,
      address: TOKEN.address!,
      chainId: rules!.chainId,
      decimals,
      maxSupply,
      totalSupply: figures.total,
      circulatingSupply: figures.circulating,
      burned: figures.burned,
      burnAddresses: [...burnAddresses],
      nonCirculating: current.held.map((wallet) => ({
        address: wallet.address,
        label: wallet.label,
        balance: formatUnits(wallet.balance, decimals),
      })),
      asOf: { block: current.blockNumber.toString(), time: unixIso(current.timestamp) },
      rules: RULES,
    };
  });

  app.get('/v1/token/total-supply', async (_request, reply) => plain(reply, supplyFigures(snapshot(), rules!.decimals).total));
  app.get('/v1/token/circulating-supply', async (_request, reply) =>
    plain(reply, supplyFigures(snapshot(), rules!.decimals).circulating),
  );
  app.get('/v1/token/max-supply', async (_request, reply) => {
    snapshot();
    return plain(reply, rules!.maxSupply);
  });
}
