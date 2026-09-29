import { useEffect, type RefObject } from 'react';
import { formatNumber } from '../lib/format.ts';

const DURATION_MS = 1700;

/**
 * Counts the target's text up from zero to `value` when `run` turns true. The final value is
 * rendered from the start, so the figure is complete at rest and ends where it began.
 */
export function useCountUp(target: RefObject<HTMLElement | null>, value: number, decimals: number, run: boolean): void {
  useEffect(() => {
    const element = target.current;
    if (!run || !element) return;
    const start = performance.now();
    let frame = 0;
    const step = (now: number) => {
      const progress = Math.min(1, (now - start) / DURATION_MS);
      element.textContent = formatNumber(value * (1 - Math.pow(1 - progress, 4)), decimals);
      if (progress < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => {
      cancelAnimationFrame(frame);
      element.textContent = formatNumber(value, decimals);
    };
  }, [target, value, decimals, run]);
}
