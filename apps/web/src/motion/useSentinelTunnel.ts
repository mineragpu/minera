import { useLayoutEffect, useRef, type RefObject } from 'react';
import { FIRST_TIME, REST_POSE, tunnelPose, type TunnelPose } from '../components/sentinel/timeline.ts';
import { clusterStyle } from './lighting.ts';
import { useFrameLoop } from './useFrameLoop.ts';
import { useReducedMotion } from './useReducedMotion.ts';

/** The camera: looking down on the tunnel from its entrance side, with the tray nearest. */
const PITCH = -20;
const YAW = 38;

interface MovingPart {
  root: HTMLElement;
  /** Opacity goes on the flat faces, since on the 3D group itself it would flatten the cube. */
  faces: HTMLElement[];
  flare: HTMLElement | null;
}

interface TunnelParts {
  items: MovingPart[];
  pass: HTMLElement[];
  block: HTMLElement[];
}

function collect(scene: HTMLElement): TunnelParts {
  const items = Array.from(scene.querySelectorAll<HTMLElement>('[data-tunnel-item]'), (root) => ({
    root,
    faces: Array.from(root.querySelectorAll<HTMLElement>('[data-tunnel-face]')),
    flare: root.querySelector<HTMLElement>('[data-tunnel-flare]'),
  }));
  return {
    items,
    pass: Array.from(scene.querySelectorAll<HTMLElement>('[data-gate-pass]')),
    block: Array.from(scene.querySelectorAll<HTMLElement>('[data-gate-block]')),
  };
}

function units(value: number): string {
  return `calc(var(--u) * ${value.toFixed(3)})`;
}

function apply(parts: TunnelParts, pose: TunnelPose): void {
  parts.items.forEach((part, index) => {
    const item = pose.items[index];
    if (!item) return;
    const opacity = item.opacity.toFixed(3);
    for (const face of part.faces) face.style.opacity = opacity;
    if (part.flare) part.flare.style.opacity = (item.flare * item.opacity).toFixed(3);
    if (item.opacity === 0) return;
    part.root.style.transform = `translate3d(${units(item.x)}, ${units(item.y)}, ${units(item.z)}) rotateZ(${item.spin.toFixed(2)}deg)`;
  });
  parts.pass.forEach((element, index) => {
    element.style.opacity = (pose.pass[index] ?? 0).toFixed(3);
  });
  parts.block.forEach((element, index) => {
    element.style.opacity = (pose.block[index] ?? 0).toFixed(3);
  });
}

/**
 * Lights the Sentinel tunnel under the hero's fixed light and plays its loop: rigs pass all five
 * gates, and bots are stopped and pushed into the quarantine tray. With reduced motion it holds
 * one still frame.
 */
export function useSentinelTunnel(stage: RefObject<HTMLElement | null>, scene: RefObject<HTMLElement | null>): void {
  const reduced = useReducedMotion();
  const clock = useRef(FIRST_TIME);
  const parts = useRef<TunnelParts | null>(null);

  useLayoutEffect(() => {
    const element = scene.current;
    if (!element) return;
    element.style.cssText = `${clusterStyle(PITCH, YAW, 0, 0)}--pitch:${PITCH}deg;--yaw:${YAW}deg;`;
    parts.current = collect(element);
    apply(parts.current, reduced ? REST_POSE : tunnelPose(clock.current));
  }, [reduced, scene]);

  useFrameLoop(
    stage,
    (_now, delta) => {
      if (!parts.current) return;
      clock.current += delta;
      apply(parts.current, tunnelPose(clock.current));
    },
    !reduced,
  );
}
