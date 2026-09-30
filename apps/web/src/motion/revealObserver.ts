type RevealListener = () => void;

/** Reveals start just before an element enters, so it is settling as it comes into view. */
const ROOT_MARGIN = '0px 0px 8% 0px';
/** Items arriving together stagger by position, up to this many steps. */
const MAX_ORDER = 8;
/** Anything in view this long without a reveal is shown anyway. */
const FAILSAFE_MS = 2500;
const SWEEP_MS = 500;

const pending = new Set<Element>();
const listeners = new Map<Element, Set<RevealListener>>();
const inViewSince = new WeakMap<Element, number>();
let observer: IntersectionObserver | null = null;
let sweepTimer = 0;

function inViewport(element: Element): boolean {
  const rect = element.getBoundingClientRect();
  return (rect.width > 0 || rect.height > 0) && rect.bottom > 0 && rect.top < window.innerHeight;
}

/**
 * Marks an element revealed: `play` runs its entrance, `done` shows it at rest at once. `order` is
 * its place among items revealed in the same batch.
 */
function reveal(element: Element, how: 'play' | 'done', order = 0): void {
  if (!pending.delete(element)) return;
  observer?.unobserve(element);
  if (how === 'play' && order > 0 && (element instanceof HTMLElement || element instanceof SVGElement)) {
    element.style.setProperty('--reveal-order', String(Math.min(order, MAX_ORDER)));
  }
  element.setAttribute('data-revealed', how);
  listeners.get(element)?.forEach((listener) => listener());
  if (pending.size === 0) stopSweep();
}

function onEntries(entries: IntersectionObserverEntry[]): void {
  const arriving = entries
    .filter((entry) => entry.isIntersecting && pending.has(entry.target))
    .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top || a.boundingClientRect.left - b.boundingClientRect.left);
  let order = 0;
  for (const entry of arriving) {
    // Content the reader has already passed is shown as it is; only content ahead of them plays.
    const fromAbove = entry.boundingClientRect.top < (entry.rootBounds?.top ?? 0);
    if (fromAbove) reveal(entry.target, 'done');
    else reveal(entry.target, 'play', order++);
  }
}

function sweep(): void {
  if (document.hidden) return;
  const now = performance.now();
  for (const element of pending) {
    if (!inViewport(element)) {
      inViewSince.delete(element);
      continue;
    }
    const since = inViewSince.get(element);
    if (since === undefined) inViewSince.set(element, now);
    else if (now - since >= FAILSAFE_MS) reveal(element, 'done');
  }
}

function startSweep(): void {
  if (!sweepTimer) sweepTimer = window.setInterval(sweep, SWEEP_MS);
}

function stopSweep(): void {
  window.clearInterval(sweepTimer);
  sweepTimer = 0;
}

/** Creates the shared observer; false where IntersectionObserver is missing. */
export function ensureRevealObserver(): boolean {
  if (!('IntersectionObserver' in window)) return false;
  observer ??= new IntersectionObserver(onEntries, { rootMargin: ROOT_MARGIN });
  return true;
}

/** Shows every pending element in or above the viewport, at rest. */
export function revealPendingInView(): void {
  for (const element of pending) {
    const rect = element.getBoundingClientRect();
    if ((rect.width > 0 || rect.height > 0) && rect.top < window.innerHeight) reveal(element, 'done');
  }
}

/**
 * Watches an element until it is revealed, then calls `onReveal`. Returns the cleanup. Without an
 * observer the element counts as revealed at once, and the stylesheet never hides it.
 */
export function observeReveal(element: Element, onReveal?: RevealListener): () => void {
  if (element.hasAttribute('data-revealed') || !ensureRevealObserver() || !observer) {
    onReveal?.();
    return () => undefined;
  }
  if (onReveal) {
    const set = listeners.get(element) ?? new Set<RevealListener>();
    set.add(onReveal);
    listeners.set(element, set);
  }
  pending.add(element);
  observer.observe(element);
  startSweep();
  return () => {
    if (onReveal) {
      const set = listeners.get(element);
      set?.delete(onReveal);
      if (set?.size === 0) listeners.delete(element);
    }
    if (pending.delete(element)) observer?.unobserve(element);
    if (pending.size === 0) stopSweep();
  };
}

/** A ref callback that reveals its element once it scrolls into view. Stable, so it never re-renders. */
export function revealRef(element: Element | null): (() => void) | undefined {
  return element ? observeReveal(element) : undefined;
}
