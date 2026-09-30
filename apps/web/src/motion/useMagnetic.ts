import { useCallback, type RefCallback } from 'react';
import { useReducedMotion } from './useReducedMotion.ts';

/** Only a fine pointer on a wide screen gets the pull; phones and tablets keep still buttons. */
const WHERE = '(hover: hover) and (pointer: fine) and (min-width: 1024px)';
/** Share of the pointer's offset from the center the element follows, and the most it moves. */
const STRENGTH = 0.28;
const MAX_PX = 8;
const EASE = 0.18;

function clamp(value: number): number {
  return Math.min(MAX_PX, Math.max(-MAX_PX, value));
}

/**
 * Pulls the element a few pixels toward a fine pointer while the pointer is over it, and lets it
 * spring back when the pointer leaves. Give the element some padding, offset by a negative margin,
 * so the pull starts just outside the button inside it.
 */
export function useMagnetic<T extends HTMLElement>(): RefCallback<T> {
  const reduced = useReducedMotion();

  return useCallback(
    (element: T | null) => {
      if (!element || reduced) return;
      const media = window.matchMedia(WHERE);
      const target = { x: 0, y: 0 };
      const current = { x: 0, y: 0 };
      let frame = 0;

      const tick = () => {
        current.x += (target.x - current.x) * EASE;
        current.y += (target.y - current.y) * EASE;
        const done = Math.abs(target.x - current.x) < 0.05 && Math.abs(target.y - current.y) < 0.05;
        if (done) {
          current.x = target.x;
          current.y = target.y;
        }
        element.style.transform = current.x || current.y ? `translate3d(${current.x.toFixed(2)}px,${current.y.toFixed(2)}px,0)` : '';
        frame = done ? 0 : requestAnimationFrame(tick);
      };

      const onMove = (event: PointerEvent) => {
        if (event.pointerType !== 'mouse' || !media.matches) return;
        const rect = element.getBoundingClientRect();
        target.x = clamp((event.clientX - (rect.left + rect.width / 2)) * STRENGTH);
        target.y = clamp((event.clientY - (rect.top + rect.height / 2)) * STRENGTH);
        if (!frame) frame = requestAnimationFrame(tick);
      };

      const onLeave = () => {
        target.x = 0;
        target.y = 0;
        if (!frame) frame = requestAnimationFrame(tick);
      };

      element.addEventListener('pointermove', onMove);
      element.addEventListener('pointerleave', onLeave);
      return () => {
        element.removeEventListener('pointermove', onMove);
        element.removeEventListener('pointerleave', onLeave);
        if (frame) cancelAnimationFrame(frame);
        element.style.transform = '';
      };
    },
    [reduced],
  );
}
