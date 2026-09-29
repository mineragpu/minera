import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react';
import { clusterStyle } from './lighting.ts';
import { useFrameLoop } from './useFrameLoop.ts';
import { usePointerTilt } from './usePointerTilt.ts';
import { useReducedMotion } from './useReducedMotion.ts';

const PITCH = -24;
/** The lit three-quarter pose shown when motion is reduced. */
const REST_YAW = -38;
/** The cluster spins in from here and settles into a slow turn. */
const START_YAW = -112;
const CRUISE_DEG_PER_SECOND = 7;
const ASSEMBLY_MS = 3200;
const FLASH_AT_SECONDS = 1.9;

interface ClusterMotion {
  start: number;
  yaw: number;
  tiltX: number;
  tiltY: number;
  flash: number;
  flashed: boolean;
}

/**
 * Assembles the block cluster, then turns it slowly under one fixed light and tilts it toward a
 * fine pointer. Returns whether the assembly animation is still playing.
 */
export function useBlockCluster(stage: RefObject<HTMLElement | null>, cluster: RefObject<HTMLElement | null>): boolean {
  const reduced = useReducedMotion();
  const [assembling, setAssembling] = useState(!reduced);
  const pointer = usePointerTilt(stage, !reduced);
  const motion = useRef<ClusterMotion>({ start: 0, yaw: START_YAW, tiltX: 0, tiltY: 0, flash: 0, flashed: false });

  useEffect(() => {
    if (!assembling) return;
    const timer = window.setTimeout(() => setAssembling(false), ASSEMBLY_MS);
    return () => window.clearTimeout(timer);
  }, [assembling]);

  useLayoutEffect(() => {
    const element = cluster.current;
    if (!element) return;
    if (reduced) {
      element.style.cssText = clusterStyle(PITCH, REST_YAW, 0, 0);
      return;
    }
    const state = motion.current;
    state.start = performance.now();
    element.style.cssText = clusterStyle(PITCH, state.yaw, 0, 0);
  }, [reduced, cluster]);

  useFrameLoop(
    stage,
    (now, delta) => {
      const element = cluster.current;
      if (!element) return;
      const state = motion.current;
      const elapsed = (now - state.start) / 1000;
      state.yaw += (CRUISE_DEG_PER_SECOND + 64 * Math.exp(-elapsed * 1.4)) * delta;
      const ease = 1 - Math.exp(-delta * 3);
      state.tiltX += (pointer.current.x - state.tiltX) * ease;
      state.tiltY += (pointer.current.y - state.tiltY) * ease;
      if (!state.flashed && elapsed > FLASH_AT_SECONDS) {
        state.flash = 1;
        state.flashed = true;
      }
      state.flash *= Math.exp(-delta * 2.4);
      element.style.cssText = clusterStyle(
        PITCH - state.tiltY * 10,
        state.yaw + state.tiltX * 20,
        Math.sin(elapsed * 0.9) * 4,
        state.flash,
      );
    },
    !reduced,
  );

  return assembling;
}
