import type { Random } from '../random.ts';

let ids = 0;

/** A reproducible `Random` for tests (mulberry32). Ids count up across instances, so they never collide. */
export function seededRandom(seed: number, options: { chance?: boolean } = {}): Random {
  let state = seed >>> 0;
  const next = (): number => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
  return {
    int: (max) => Math.floor(next() * max),
    chance: (probability) => options.chance ?? next() < probability,
    uuid: () => `00000000-0000-4000-8000-${(ids++).toString(16).padStart(12, '0')}`,
  };
}
