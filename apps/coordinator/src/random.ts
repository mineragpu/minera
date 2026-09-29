import { randomInt, randomUUID } from 'node:crypto';

export interface Random {
  /** An integer in [0, max). */
  int(max: number): number;
  /** True with the given probability. */
  chance(probability: number): boolean;
  uuid(): string;
}

const CHANCE_SCALE = 1_000_000;

/** Nodes must not be able to predict which jobs are cross-checked, so draws are cryptographic. */
export const cryptoRandom: Random = {
  int: (max) => randomInt(max),
  chance: (probability) => randomInt(CHANCE_SCALE) < Math.round(probability * CHANCE_SCALE),
  uuid: () => randomUUID(),
};
