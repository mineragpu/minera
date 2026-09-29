import { useEffect, useRef, type RefObject } from 'react';

export interface PointerTarget {
  /** -1 at the left edge of the viewport, 1 at the right, measured from the stage centre. */
  x: number;
  /** -1 at the top, 1 at the bottom, measured from the stage centre. */
  y: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * Tracks where a fine pointer sits relative to the stage. The caller eases toward the target;
 * touch input is ignored, so the figure rests on phones.
 */
export function usePointerTilt(stage: RefObject<Element | null>, enabled: boolean): RefObject<PointerTarget> {
  const target = useRef<PointerTarget>({ x: 0, y: 0 });

  useEffect(() => {
    if (!enabled) return;
    const onMove = (event: PointerEvent) => {
      const element = stage.current;
      if (event.pointerType === 'touch' || !element) return;
      const rect = element.getBoundingClientRect();
      target.current.x = clamp((event.clientX - (rect.left + rect.width / 2)) / (window.innerWidth / 2), -1, 1);
      target.current.y = clamp((event.clientY - (rect.top + rect.height / 2)) / (window.innerHeight / 2), -1, 1);
    };
    window.addEventListener('pointermove', onMove, { passive: true });
    return () => {
      window.removeEventListener('pointermove', onMove);
      target.current.x = 0;
      target.current.y = 0;
    };
  }, [enabled, stage]);

  return target;
}
