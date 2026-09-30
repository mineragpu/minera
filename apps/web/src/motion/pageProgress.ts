import { onScrollFrame, requestScrollFrame } from './scrollFrame.ts';

/** Where the stylesheet already drives the line from the root scroll timeline. */
const NATIVE = typeof CSS !== 'undefined' && CSS.supports('animation-timeline: scroll()');

/**
 * A ref callback for the page progress line where scroll timelines are missing: it scales the line
 * with how far the page is scrolled. The scroll range is measured only when the page resizes.
 */
export function pageProgressRef(element: HTMLElement | null): (() => void) | undefined {
  if (!element || NATIVE || !('ResizeObserver' in window)) return undefined;
  const root = document.documentElement;
  let range = 1;
  const sizes = new ResizeObserver(() => {
    range = Math.max(1, root.scrollHeight - window.innerHeight);
    requestScrollFrame();
  });
  sizes.observe(root);
  const stop = onScrollFrame(() => {
    const value = Math.min(1, Math.max(0, window.scrollY / range));
    return () => {
      element.style.transform = `scaleX(${value.toFixed(4)})`;
    };
  });
  return () => {
    sizes.disconnect();
    stop();
  };
}
