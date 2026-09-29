import type { FastifyInstance } from 'fastify';
import packageJson from '../../package.json' with { type: 'json' };
import type { RouteContext } from './context.ts';

export interface Health {
  status: 'ok';
  version: string;
  network: string;
  chainId: number;
}

/** Answers from memory only, so a slow database never fails the platform's health check. */
export function registerHealthRoute(app: FastifyInstance, context: RouteContext): void {
  const health: Health = {
    status: 'ok',
    version: packageJson.version,
    network: context.config.network,
    chainId: context.config.chain.id,
  };
  app.get('/health', async (): Promise<Health> => health);
}
