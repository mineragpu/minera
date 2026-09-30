import { useCallback, type RefCallback } from 'react';
import { useReducedMotion } from './useReducedMotion.ts';

const DEG = Math.PI / 180;
/** Fraction of the remaining distance closed each frame. */
const EASE = 0.2;

interface Follow {
  /** Edge angle, in degrees. */
  rot: number;
  /** Pointer position over the element, in pixels. */
  x: number;
  y: number;
  /** Lean toward the pointer, from −1 to 1 on each axis. */
  tiltX: number;
  tiltY: number;
}

function settled(target: Follow, current: Follow): boolean {
  return (
    Math.abs(target.rot - current.rot) < 0.2 &&
    Math.abs(target.x - current.x) < 0.5 &&
    Math.abs(target.y - current.y) < 0.5 &&
    Math.abs(target.tiltX - current.tiltX) < 0.002 &&
    Math.abs(target.tiltY - current.tiltY) < 0.002
  );
}

/**
 * Follows a fine pointer across the element. It turns the conic iridescent edge so its teal end
 * faces the pointer (`--iri-rot`), places the sheen spot under the pointer (`--sheen-x`,
 * `--sheen-y`) and leans toward it (`--tilt-x`, `--tilt-y`, back to 0 when the pointer leaves).
 * Touch input is ignored, so nothing moves under a finger.
 */
export function useSheenFollow<T extends HTMLElement>(): RefCallback<T> {
  const reduced = useReducedMotion();

  return useCallback(
    (element: T | null) => {
      if (!element || reduced) return;
      const target: Follow = { rot: 0, x: 0, y: 0, tiltX: 0, tiltY: 0 };
      const current: Follow = { ...target };
      let frame = 0;

      const tick = () => {
        current.rot += (target.rot - current.rot) * EASE;
        current.x += (target.x - current.x) * EASE;
        current.y += (target.y - current.y) * EASE;
        current.tiltX += (target.tiltX - current.tiltX) * EASE;
        current.tiltY += (target.tiltY - current.tiltY) * EASE;
        element.style.setProperty('--iri-rot', `${current.rot.toFixed(2)}deg`);
        element.style.setProperty('--sheen-x', `${current.x.toFixed(1)}px`);
        element.style.setProperty('--sheen-y', `${current.y.toFixed(1)}px`);
        element.style.setProperty('--tilt-x', current.tiltX.toFixed(3));
        element.style.setProperty('--tilt-y', current.tiltY.toFixed(3));
        frame = settled(target, current) ? 0 : requestAnimationFrame(tick);
      };

      const aim = (event: PointerEvent) => {
        const rect = element.getBoundingClientRect();
        const x = event.clientX - rect.left;
        const y = event.clientY - rect.top;
        let angle = Math.atan2(y - rect.height / 2, x - rect.width / 2) / DEG + 90;
        while (angle - current.rot > 180) angle -= 360;
        while (angle - current.rot < -180) angle += 360;
        target.rot = angle;
        target.x = x;
        target.y = y;
        target.tiltX = Math.min(1, Math.max(-1, (x / rect.width) * 2 - 1));
        target.tiltY = Math.min(1, Math.max(-1, (y / rect.height) * 2 - 1));
      };

      const onEnter = (event: PointerEvent) => {
        if (event.pointerType === 'touch') return;
        aim(event);
        // The light appears where the pointer enters instead of sweeping in from a corner.
        current.x = target.x;
        current.y = target.y;
        if (!frame) frame = requestAnimationFrame(tick);
      };

      const onMove = (event: PointerEvent) => {
        if (event.pointerType === 'touch') return;
        aim(event);
        if (!frame) frame = requestAnimationFrame(tick);
      };

      const onLeave = () => {
        target.tiltX = 0;
        target.tiltY = 0;
        if (!frame) frame = requestAnimationFrame(tick);
      };

      element.addEventListener('pointerenter', onEnter);
      element.addEventListener('pointermove', onMove);
      element.addEventListener('pointerleave', onLeave);
      return () => {
        element.removeEventListener('pointerenter', onEnter);
        element.removeEventListener('pointermove', onMove);
        element.removeEventListener('pointerleave', onLeave);
        if (frame) cancelAnimationFrame(frame);
      };
    },
    [reduced],
  );
}
