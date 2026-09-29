type Vec3 = readonly [number, number, number];

const DEG = Math.PI / 180;

function normalize([x, y, z]: Vec3): Vec3 {
  const length = Math.hypot(x, y, z) || 1;
  return [x / length, y / length, z / length];
}

function dot(a: Vec3, b: Vec3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

/** One fixed light, upper left and slightly in front of the figure. */
const LIGHT = normalize([-0.6, -0.7, 0.4]);
const HALFWAY = normalize([LIGHT[0], LIGHT[1], LIGHT[2] + 1]);

/** Face normals before rotation, keyed by the suffix the stylesheet reads (`--sh-f`, ...). */
const NORMALS: readonly (readonly [key: string, normal: Vec3])[] = [
  ['f', [0, 0, 1]],
  ['b', [0, 0, -1]],
  ['r', [1, 0, 0]],
  ['l', [-1, 0, 0]],
  ['t', [0, -1, 0]],
];

function rotate([x, y, z]: Vec3, pitch: number, yaw: number): Vec3 {
  const a = yaw * DEG;
  const b = pitch * DEG;
  const rx = x * Math.cos(a) + z * Math.sin(a);
  const rz = -x * Math.sin(a) + z * Math.cos(a);
  return [rx, y * Math.cos(b) - rz * Math.sin(b), y * Math.sin(b) + rz * Math.cos(b)];
}

/**
 * The cluster root's inline style for one pose: its transform, plus shade, highlight, sheen
 * strength and sheen hue for each face orientation. Faces brighten as they turn toward the
 * light, and the oil-slick patches shift hue as they rotate.
 *
 * @param pitch rotation about X, in degrees
 * @param yaw rotation about Y, in degrees
 * @param float vertical offset, in pixels
 * @param flash specular flash strength, 0–1
 */
export function clusterStyle(pitch: number, yaw: number, float: number, flash: number): string {
  let css = `transform:translate3d(0,${float.toFixed(2)}px,0) rotateX(${pitch.toFixed(3)}deg) rotateY(${yaw.toFixed(3)}deg);`;
  for (const [key, normal] of NORMALS) {
    const n = rotate(normal, pitch, yaw);
    const diffuse = Math.max(0, dot(n, LIGHT));
    const shade = 0.62 * Math.pow(1 - diffuse, 1.3);
    const specular = Math.pow(Math.max(0, dot(n, HALFWAY)), 6);
    const highlight = Math.min(0.85, specular * 1.1 + Math.pow(diffuse, 4) * 0.25 + flash * 0.55 * diffuse);
    const sheen = 0.3 + 0.7 * Math.pow(1 - Math.max(0, n[2]), 1.2);
    const hue = Math.atan2(n[0], n[2]) / DEG + yaw * 0.35;
    css += `--sh-${key}:${shade.toFixed(3)};--hl-${key}:${highlight.toFixed(3)};--ir-${key}:${sheen.toFixed(3)};--hr-${key}:${hue.toFixed(1)};`;
  }
  return css;
}
