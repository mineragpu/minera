import { normalizeOutput } from './normalize.ts';

/**
 * An estimate of the tokens in a text: one per four characters, rounded up. It is not a
 * tokenizer count, but it is deterministic and the same for every rig and model.
 */
export function estimateTokens(text: string): number {
  return Math.ceil([...text].length / 4);
}

/**
 * Work units for an output, measured by the coordinator from what it received. Padding cannot
 * earn more than the job's `maxTokens`, and whitespace is not counted twice.
 */
export function measureUnits(output: string, maxTokens: number): number {
  return Math.min(estimateTokens(normalizeOutput(output)), maxTokens);
}
