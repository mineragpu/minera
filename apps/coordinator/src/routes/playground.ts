import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { submitPlaygroundJob } from '../jobs/playground.ts';
import { viewPlaygroundJob, type PlaygroundView } from '../jobs/playgroundView.ts';
import type { RouteContext } from './context.ts';
import { ApiError } from './errors.ts';
import { iso, WORK_RULES } from './format.ts';
import { jobIdSchema, parse } from './validate.ts';

export const MAX_PROMPT_CHARS = 2_000;
/** Prompts per visitor address. The queue itself is capped too, whatever the number of addresses. */
export const PLAYGROUND_RATE_LIMIT = { max: 5, timeWindow: '1 minute' } as const;

const promptSchema = z.object({
  prompt: z
    .string()
    .trim()
    .min(1, 'Enter a prompt.')
    .max(MAX_PROMPT_CHARS, `Keep the prompt to ${MAX_PROMPT_CHARS} characters or fewer.`),
});

export interface PlaygroundJobView extends Omit<PlaygroundView, 'createdAt' | 'finishedAt'> {
  createdAt: string;
  finishedAt: string | null;
  rule: string;
}

export function registerPlaygroundRoutes(app: FastifyInstance, context: RouteContext): void {
  const { store, config, clock, random } = context;

  app.post('/v1/playground/jobs', { config: { rateLimit: PLAYGROUND_RATE_LIMIT } }, async (request, reply) => {
    const { prompt } = parse(promptSchema, request.body, 'body');
    const id = await submitPlaygroundJob(
      store,
      { ...config.playground, redundancyRate: config.redundancyRate },
      prompt,
      clock(),
      random,
    );
    return reply.status(202).send({ id, status: 'queued' });
  });

  app.get('/v1/playground/jobs/:id', async (request): Promise<PlaygroundJobView> => {
    const { id } = parse(z.object({ id: jobIdSchema }), request.params, 'params');
    const view = await viewPlaygroundJob(store, id);
    if (!view) throw new ApiError(404, 'job_not_found', 'There is no playground job with this id.');
    return { ...view, createdAt: view.createdAt.toISOString(), finishedAt: iso(view.finishedAt), rule: WORK_RULES.verification };
  });
}
