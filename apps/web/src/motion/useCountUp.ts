import { useEffect, useRef, type RefObject } from 'react';
import { formatNumber } from '../lib/format.ts';

const DURATION_MS = 1700;

/**
 * Counts the target's text up from zero to `value` the first time `run` turns true, then settles on
 * `text`. Later changes, such as a refresh, show the new text at once. The final text is rendered
 * from the start, so the figure is complete at rest.
 */
export function useCountUp(target: RefObject<HTMLElement | null>, value: number, text: string, run: boolean): void {
  const played = useRef(false);

  useEffect(() => {
    const element = target.current;
    if (!run || !element) return;
    if (played.current) {
      element.textContent = text;
      return;
    }
    const decimals = text.split('.')[1]?.length ?? 0;
    const start = performance.now();
    let frame = 0;
    const step = (now: number) => {
      const progress = Math.min(1, (now - start) / DURATION_MS);
      element.textContent = progress < 1 ? formatNumber(value * (1 - Math.pow(1 - progress, 4)), decimals) : text;
      if (progress < 1) frame = requestAnimationFrame(step);
      else played.current = true;
    };
    frame = requestAnimationFrame(step);
    return () => {
      cancelAnimationFrame(frame);
      element.textContent = text;
    };
  }, [target, value, text, run]);
}
