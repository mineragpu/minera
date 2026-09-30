import { ensureRevealObserver, revealPendingInView } from './revealObserver.ts';

const REDUCED = '(prefers-reduced-motion: reduce)';
/** Set on <html>; reveal styles hide content before its entrance only while it is present. */
const MOTION_CLASS = 'motion-ok';

/**
 * Turns on reveal motion once the script is running and the reveal observer exists, and follows the
 * visitor's reduced-motion setting from then on. Without it, every element renders at rest.
 */
export function startMotion(): void {
  if (!ensureRevealObserver()) return;
  const root = document.documentElement;
  const media = window.matchMedia(REDUCED);
  const sync = () => root.classList.toggle(MOTION_CLASS, !media.matches);
  sync();
  media.addEventListener('change', sync);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') revealPendingInView();
  });
}
