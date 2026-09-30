/**
 * The Sentinel tunnel's loop as pure functions of time: where each cube is, and how brightly each
 * gate lights. Distances are in tunnel units, which the stylesheet scales with the stage; x runs
 * to the right, y down and z along the tunnel toward the viewer.
 */

/** The outer side of a gate frame. */
export const FRAME = 1.7;
/** The width of a frame's bars, and its depth along the tunnel. */
export const BAR = 0.09;
export const FRAME_DEPTH = 0.16;
export const CUBE = 0.58;
export const GATE_Z: readonly number[] = [-2.4, -1.2, 0, 1.2, 2.4];
/** Half the width of the raised track the gates stand on. */
export const TRACK_HALF = 1;
/** How far below the track the ground, and the quarantine tray on it, sits. */
export const DROP = 0.42;
/** The middle of the quarantine tray, beside the track on the viewer's side. */
export const TRAY_X = -1.72;

const ENTER_Z = -4.6;
/** Where a rig that cleared the last gate flashes gold. */
const GLINT_Z = 3.3;
const GONE_Z = 4.3;
const SPEED = 1.05;
const PERIOD = 15;
const FADE_IN = 0.6;
const FADE_OUT = 0.7;
/** How far short of its gate a stopped bot rests, and how far it is knocked back. */
const STOP_GAP = 0.06;
const RECOIL = 0.1;
const HOLD = 1.1;
const PUSH = 0.45;
const FALL = 0.5;
const SETTLE = 0.3;
/** How close to a gate's plane a cube must be for the gate to light. */
const SCAN_REACH = 0.3;

export type TunnelItem =
  | { readonly kind: 'rig'; readonly start: number }
  | { readonly kind: 'bot'; readonly start: number; readonly gate: number };

/**
 * Rigs and bots take turns every 2.5 seconds. Each bot is stopped at a different gate: proof of
 * GPU, the canary checks or the cross-check.
 */
export const ITEMS: readonly TunnelItem[] = [
  { kind: 'rig', start: 0 },
  { kind: 'bot', start: 2.5, gate: 1 },
  { kind: 'rig', start: 5 },
  { kind: 'bot', start: 7.5, gate: 2 },
  { kind: 'rig', start: 10 },
  { kind: 'bot', start: 12.5, gate: 3 },
];

export interface ItemPose {
  x: number;
  y: number;
  z: number;
  /** A tumble about the tunnel axis, in degrees. */
  spin: number;
  opacity: number;
  /** A rig's gold glint as it clears the last gate, or a stopped bot's magenta alarm; 0 to 1. */
  flare: number;
}

export interface TunnelPose {
  items: ItemPose[];
  /** How brightly each gate lights gold as a cube passes it; 0 to 1. */
  pass: number[];
  /** How brightly each gate flashes magenta as it stops a bot; 0 to 1. */
  block: number[];
}

const HIDDEN: ItemPose = { x: 0, y: 0, z: ENTER_Z, spin: 0, opacity: 0, flare: 0 };
const ON_TRACK = -CUBE / 2;
const IN_TRAY = DROP - CUBE / 2;

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function easeInOut(k: number): number {
  return k < 0.5 ? 4 * k * k * k : 1 - (-2 * k + 2) ** 3 / 2;
}

function easeOut(k: number): number {
  return 1 - (1 - k) ** 2;
}

function gateAt(index: number): number {
  return GATE_Z[index] ?? 0;
}

function stopZ(gate: number): number {
  return gateAt(gate) - FRAME_DEPTH / 2 - CUBE / 2 - STOP_GAP;
}

function phaseAt(z: number): number {
  return (z - ENTER_Z) / SPEED;
}

function rigPose(phase: number): ItemPose {
  const z = ENTER_Z + SPEED * phase;
  if (z >= GONE_Z) return HIDDEN;
  const leaving = clamp01((z - GLINT_Z - 0.2) / (GONE_Z - GLINT_Z - 0.2));
  const past = z - GLINT_Z;
  const flare = past < 0 ? Math.exp(-((past / 0.16) ** 2)) : Math.exp(-past / 0.45);
  return { x: 0, y: ON_TRACK, z, spin: 0, opacity: clamp01(phase / FADE_IN) * (1 - leaving), flare };
}

/** The magenta alarm after a bot is stopped: a sharp flash, a few pulses, then a fade. */
function alarm(caught: number): number {
  if (caught < 0) return 0;
  const attack = clamp01(caught / 0.06);
  const decay = Math.exp(-Math.max(0, caught - HOLD * 0.7) * 3.2);
  const pulse = 0.7 + 0.3 * Math.cos(caught * Math.PI * 5);
  return attack * decay * pulse;
}

function botPose(phase: number, gate: number): ItemPose {
  const stop = stopZ(gate);
  const arrive = phaseAt(stop);
  if (phase < arrive) {
    return { x: 0, y: ON_TRACK, z: ENTER_Z + SPEED * phase, spin: 0, opacity: clamp01(phase / FADE_IN), flare: 0 };
  }
  const caught = phase - arrive;
  const z = stop - RECOIL * (1 - Math.exp(-caught * 14));
  const flare = alarm(caught);
  if (caught < HOLD) return { x: 0, y: ON_TRACK, z, spin: 0, opacity: 1, flare };

  const pushed = caught - HOLD;
  if (pushed < PUSH) return { x: -TRACK_HALF * easeInOut(pushed / PUSH), y: ON_TRACK, z, spin: 0, opacity: 1, flare };

  const fell = pushed - PUSH;
  if (fell < FALL) {
    const k = fell / FALL;
    return {
      x: -TRACK_HALF + (TRAY_X + TRACK_HALF) * easeOut(k),
      y: ON_TRACK + DROP * k * k,
      z,
      spin: -90 * easeInOut(k),
      opacity: 1,
      flare,
    };
  }

  const rested = fell - FALL;
  const bounce = rested < SETTLE ? Math.sin((rested / SETTLE) * Math.PI) * 0.05 : 0;
  const leaving = clamp01((phase - (PERIOD - FADE_OUT)) / FADE_OUT);
  return { x: TRAY_X, y: IN_TRAY - bounce + leaving * 0.12, z, spin: -90, opacity: 1 - leaving, flare };
}

/** Everything in the tunnel at `time` seconds into the loop. */
export function tunnelPose(time: number): TunnelPose {
  const pass = GATE_Z.map(() => 0);
  const block = GATE_Z.map(() => 0);
  const items = ITEMS.map((item) => {
    const phase = (((time - item.start) % PERIOD) + PERIOD) % PERIOD;
    const pose = item.kind === 'rig' ? rigPose(phase) : botPose(phase, item.gate);
    const reach = item.kind === 'rig' ? GATE_Z.length : item.gate;
    if (pose.x === 0 && pose.opacity > 0) {
      for (let gate = 0; gate < reach; gate += 1) {
        const lit = pose.opacity * Math.exp(-(((pose.z - gateAt(gate)) / SCAN_REACH) ** 2));
        pass[gate] = Math.max(pass[gate] ?? 0, lit);
      }
    }
    if (item.kind === 'bot') block[item.gate] = Math.max(block[item.gate] ?? 0, alarm(phase - phaseAt(stopZ(item.gate))));
    return pose;
  });
  return { items, pass, block };
}

/**
 * The still frame shown when motion is reduced: one rig glinting past the last gate, one partway
 * through, and a bot stopped at the canary checks lying in the quarantine tray.
 */
export const REST_POSE: TunnelPose = {
  items: ITEMS.map((item, index) => {
    if (item.kind === 'bot') return item.gate === 2 ? botPose(PERIOD - 3, item.gate) : HIDDEN;
    if (index === 0) return rigPose(phaseAt(GLINT_Z + 0.08));
    return index === 2 ? rigPose(phaseAt(-0.62)) : HIDDEN;
  }),
  pass: GATE_Z.map(() => 0),
  block: GATE_Z.map(() => 0),
};

/** Where the loop starts, so the first frame already has a rig in the tunnel and bots in the tray. */
export const FIRST_TIME = 4;
