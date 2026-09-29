import type { CSSProperties } from 'react';

const FACE_SIDES = ['front', 'back', 'right', 'left', 'top'] as const;
type FaceSide = (typeof FACE_SIDES)[number];

interface FaceSpec {
  readonly side: FaceSide;
  readonly style: CSSProperties;
  /** Larger blocks carry an inset panel line. */
  readonly inset: boolean;
}

interface CubeSpec {
  readonly key: number;
  readonly style: CSSProperties;
  readonly faces: readonly FaceSpec[];
}

/** x, y, z and size in cluster units, then how strongly the oil-slick patch shows (0–1). */
type CubeSeed = readonly [x: number, y: number, z: number, size: number, sheen: number];

const CUBES: readonly CubeSeed[] = [
  [0, 0, 0, 2, 0.55],
  [-0.45, 1.56, -0.35, 1, 0.75],
  [1.56, -0.5, 0.45, 1, 0.5],
  [-1.5, -0.55, 0.55, 0.9, 0.65],
  [-1.45, -0.6, -0.75, 0.8, 0.5],
  [1.35, 0.33, 0.62, 0.5, 0.85],
  [0.35, -0.725, 1.33, 0.55, 0.6],
  [0.62, 1.31, 0.52, 0.5, 0.8],
  [0.15, 0.25, -1.31, 0.55, 0.6],
  [-1.25, 0.95, 0.95, 0.3, 0.95],
  [2.2, 0.85, -0.35, 0.28, 0.95],
  [-2.15, 0.35, -0.55, 0.24, 0.95],
];

/** A fixed seed keeps every visit's cluster identical. */
const SEED = 20260929;

function mulberry32(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function degrees(value: number): string {
  return `${Math.round(value)}deg`;
}

/**
 * Lays out the twelve blocks, their exploded start positions and per-face sheen placement.
 * The largest block lands first, then the rest in order of distance from the core.
 */
function buildCluster(): readonly CubeSpec[] {
  const random = mulberry32(SEED);
  const order = CUBES.map(([x, y, z], index) => ({ index, distance: Math.hypot(x, y - 0.4, z) })).sort(
    (a, b) => a.distance - b.distance,
  );
  const delays = new Map(order.map(({ index }, rank) => [index, rank === 0 ? 0.1 : 0.28 + rank * 0.075]));

  return CUBES.map(([x, y, z, size, sheen], index) => {
    let dx = x;
    let dy = y - 0.4;
    let dz = z;
    let length = Math.hypot(dx, dy, dz);
    if (length < 0.3) {
      dx = 0.3;
      dy = 1;
      dz = 0.8;
      length = Math.hypot(dx, dy, dz);
    }
    const flight = 2.4 + random() * 1.6;

    const style: CSSProperties = {
      '--x': x,
      '--y': y,
      '--z': z,
      '--s': size,
      '--ex': ((dx / length) * flight).toFixed(3),
      '--ey': ((-dy / length) * flight).toFixed(3),
      '--ez': ((dz / length) * flight).toFixed(3),
      '--rx0': degrees((random() - 0.5) * 240),
      '--ry0': degrees((random() - 0.5) * 300),
      '--rz0': degrees((random() - 0.5) * 160),
      '--d': `${(delays.get(index) ?? 0).toFixed(2)}s`,
      '--bw': `${size >= 1.5 ? 2 : size >= 0.8 ? 1.5 : 1}px`,
    };

    const faces = FACE_SIDES.map((side) => ({
      side,
      inset: size >= 0.9,
      style: {
        '--tpx': `${Math.round(12 + random() * 76)}%`,
        '--tpy': `${Math.round(12 + random() * 76)}%`,
        '--tar': Math.min(1, sheen * (0.5 + random() * 0.7)).toFixed(2),
        '--to': degrees(random() * 360),
        '--eo': degrees(random() * 360),
      },
    }));

    return { key: index, style, faces };
  });
}

export const CLUSTER: readonly CubeSpec[] = buildCluster();
