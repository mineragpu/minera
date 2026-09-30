/** Loops start again a little before they scroll back into view. */
const MARGIN = '120px';

let observer: IntersectionObserver | null = null;

function onEntries(entries: IntersectionObserverEntry[]): void {
  for (const entry of entries) entry.target.toggleAttribute('data-idle', !entry.isIntersecting);
}

/**
 * A ref callback that sets `data-idle` on its element while it is off screen, so the looping
 * animations inside it can pause. One observer serves every element.
 */
export function loopRef(element: Element | null): (() => void) | undefined {
  if (!element || !('IntersectionObserver' in window)) return undefined;
  observer ??= new IntersectionObserver(onEntries, { rootMargin: MARGIN });
  observer.observe(element);
  return () => observer?.unobserve(element);
}
