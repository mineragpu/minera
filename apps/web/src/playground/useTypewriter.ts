import { useEffect, type RefObject } from 'react';

const TYPE_MS = 42;
const ERASE_MS = 18;
const HOLD_MS = 1700;
const GAP_MS = 420;

/**
 * Types each line into the target, holds it, erases it and moves on to the next, for as long as
 * `active` is true. It waits while the tab is hidden, and empties the target when it stops.
 */
export function useTypewriter(target: RefObject<HTMLElement | null>, lines: readonly string[], active: boolean): void {
  useEffect(() => {
    const element = target.current;
    if (!active || !element || lines.length === 0) return;
    let line = 0;
    let shown = 0;
    let erasing = false;
    let timer = 0;

    const step = () => {
      if (document.hidden) {
        timer = window.setTimeout(step, GAP_MS);
        return;
      }
      const text = lines[line] ?? '';
      if (!erasing) {
        shown += 1;
        element.textContent = text.slice(0, shown);
        if (shown < text.length) {
          timer = window.setTimeout(step, TYPE_MS);
          return;
        }
        erasing = true;
        timer = window.setTimeout(step, HOLD_MS);
        return;
      }
      shown -= 1;
      element.textContent = text.slice(0, shown);
      if (shown > 0) {
        timer = window.setTimeout(step, ERASE_MS);
        return;
      }
      erasing = false;
      line = (line + 1) % lines.length;
      timer = window.setTimeout(step, GAP_MS);
    };

    timer = window.setTimeout(step, GAP_MS);
    return () => {
      window.clearTimeout(timer);
      element.textContent = '';
    };
  }, [target, lines, active]);
}
