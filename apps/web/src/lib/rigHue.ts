import type { Address } from '@dayagpu/shared';

const HUES = ['var(--teal)', 'var(--blue)', 'var(--violet)', 'var(--magenta)', 'var(--gold)'] as const;

/** A palette accent fixed by the node key, so a rig keeps its color on the board and its page. */
export function rigHue(nodeKey: Address): string {
  return HUES[Number.parseInt(nodeKey.slice(-2), 16) % HUES.length] ?? HUES[0];
}
