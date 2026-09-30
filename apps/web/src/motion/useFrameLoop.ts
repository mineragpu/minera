import { useEffect, useLayoutEffect, useRef, type RefObject } from 'react';

type FrameCallback = (now: number, deltaSeconds: number) => void;

/** Caps one step, so a loop that resumes after a pause does not jump. */
const MAX_STEP_SECONDS = 0.05;

/**
 * Runs `onFrame` on every animation frame while `active` is true, the target is on screen (with a
 * small margin) and the tab is visible.
 */
export function useFrameLoop(target: RefObject<Element | null>, onFrame: FrameCallback, active: boolean): void {
  const callback = useRef(onFrame);
  useLayoutEffect(() => {
    callback.current = onFrame;
  });

  useEffect(() => {
    const element = target.current;
    if (!active || !element) return;

    let frame = 0;
    let last = 0;
    let onScreen = true;

    const tick = (now: number) => {
      const delta = Math.min(MAX_STEP_SECONDS, (now - last) / 1000);
      last = now;
      callback.current(now, delta);
      frame = requestAnimationFrame(tick);
    };

    const sync = () => {
      const run = onScreen && !document.hidden;
      if (run && !frame) {
        last = performance.now();
        frame = requestAnimationFrame(tick);
      } else if (!run && frame) {
        cancelAnimationFrame(frame);
        frame = 0;
      }
    };

    // Without IntersectionObserver the loop runs whenever the tab is visible.
    const observer =
      'IntersectionObserver' in window
        ? new IntersectionObserver(
            (entries) => {
              const latest = entries[entries.length - 1];
              if (latest) onScreen = latest.isIntersecting;
              sync();
            },
            { rootMargin: '120px' },
          )
        : null;
    observer?.observe(element);
    document.addEventListener('visibilitychange', sync);
    sync();

    return () => {
      observer?.disconnect();
      document.removeEventListener('visibilitychange', sync);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [active, target]);
}
