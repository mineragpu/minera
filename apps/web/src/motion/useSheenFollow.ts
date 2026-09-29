import { useCallback, type RefCallback } from 'react';
import { useReducedMotion } from './useReducedMotion.ts';

const DEG = Math.PI / 180;
/** Fraction of the remaining angle closed each frame. */
const EASE = 0.2;

/**
 * Turns the element's conic iridescent edge so its teal end faces a fine pointer. Writes the
 * angle to `--iri-rot`, which the edge reads as a rotation.
 */
export function useSheenFollow<T extends HTMLElement>(): RefCallback<T> {
  const reduced = useReducedMotion();

  return useCallback(
    (element: T | null) => {
      if (!element || reduced) return;
      let target = 0;
      let current = 0;
      let frame = 0;

      const tick = () => {
        current += (target - current) * EASE;
        element.style.setProperty('--iri-rot', `${current.toFixed(2)}deg`);
        frame = Math.abs(target - current) > 0.2 ? requestAnimationFrame(tick) : 0;
      };

      const onMove = (event: PointerEvent) => {
        if (event.pointerType === 'touch') return;
        const rect = element.getBoundingClientRect();
        const dy = event.clientY - (rect.top + rect.height / 2);
        const dx = event.clientX - (rect.left + rect.width / 2);
        let angle = Math.atan2(dy, dx) / DEG + 90;
        while (angle - current > 180) angle -= 360;
        while (angle - current < -180) angle += 360;
        target = angle;
        if (!frame) frame = requestAnimationFrame(tick);
      };

      element.addEventListener('pointermove', onMove);
      return () => {
        element.removeEventListener('pointermove', onMove);
        if (frame) cancelAnimationFrame(frame);
      };
    },
    [reduced],
  );
}
