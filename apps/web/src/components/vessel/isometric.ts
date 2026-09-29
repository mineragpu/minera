/** A point in vessel space: x across, y up, z toward the viewer, in drawing units. */
export type Point3 = readonly [x: number, y: number, z: number];

const COS30 = 0.8660254;
const SIN30 = 0.5;

export function project([x, y, z]: Point3): readonly [number, number] {
  return [(x - z) * COS30, (x + z) * SIN30 - y];
}

function fixed(value: number): string {
  return value.toFixed(1);
}

/** Projected coordinates, for placing text and markers. */
export function at(point: Point3): { x: string; y: string } {
  const [x, y] = project(point);
  return { x: fixed(x), y: fixed(y) };
}

/** A `points` attribute for a polygon or polyline. */
export function points(corners: readonly Point3[]): string {
  return corners
    .map((corner) => {
      const [x, y] = project(corner);
      return `${fixed(x)},${fixed(y)}`;
    })
    .join(' ');
}

/** A path segment from one point to another. */
export function segment(from: Point3, to: Point3): string {
  const [ax, ay] = project(from);
  const [bx, by] = project(to);
  return `M${fixed(ax)} ${fixed(ay)}L${fixed(bx)} ${fixed(by)}`;
}
