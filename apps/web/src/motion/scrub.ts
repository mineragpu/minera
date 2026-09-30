import { onScrollFrame, requestScrollFrame } from './scrollFrame.ts';

/** Where the stylesheet already drives `--scrub` from a view timeline. */
const NATIVE = typeof CSS !== 'undefined' && CSS.supports('animation-timeline: view()');
/** Elements slightly off screen keep updating, so they leave at 0 or 1. */
const MARGIN = '25% 0px';

interface Scrubbed {
  element: HTMLElement;
  visible: boolean;
  from: number;
  to: number;
}

const scrubbed = new Map<Element, Scrubbed>();
let observer: IntersectionObserver | null = null;
let stopFrames: (() => void) | null = null;
let rangesWidth = 0;
/** Where a view timeline's view starts: below the root's scroll padding, which clears the top bar. */
let insetTop = 0;

function readInset(): void {
  insetTop = Number.parseFloat(getComputedStyle(document.documentElement).scrollPaddingTop) || 0;
}

function rangeEnd(element: HTMLElement, name: string, fallback: number): number {
  const value = Number.parseFloat(getComputedStyle(element).getPropertyValue(name));
  return Number.isFinite(value) ? value / 100 : fallback;
}

/** The range can change at a breakpoint, so it is read again after the width changes. */
function readRange(state: Scrubbed): void {
  state.from = rangeEnd(state.element, '--scrub-from', 0);
  state.to = rangeEnd(state.element, '--scrub-to', 1);
}

/**
 * The same progress a `view()` timeline reports for `animation-range: cover from cover to`: 0 when
 * the element's top meets the viewport's bottom, 1 when its bottom meets the top of the view.
 */
function progress({ element, from, to }: Scrubbed): number {
  const rect = element.getBoundingClientRect();
  const cover = (window.innerHeight - rect.top) / (window.innerHeight - insetTop + rect.height);
  return Math.min(1, Math.max(0, (cover - from) / (to - from || 1)));
}

function write(state: Scrubbed, value: number): void {
  state.element.style.setProperty('--scrub', value.toFixed(4));
}

function readAll(): () => void {
  const widthChanged = rangesWidth !== window.innerWidth;
  rangesWidth = window.innerWidth;
  if (widthChanged) readInset();
  const values: [Scrubbed, number][] = [];
  for (const state of scrubbed.values()) {
    if (widthChanged) readRange(state);
    if (state.visible) values.push([state, progress(state)]);
  }
  return () => {
    for (const [state, value] of values) write(state, value);
  };
}

function onEntries(entries: IntersectionObserverEntry[]): void {
  for (const entry of entries) {
    const state = scrubbed.get(entry.target);
    if (state) state.visible = entry.isIntersecting;
  }
  requestScrollFrame();
}

/**
 * A ref callback for `[data-scrub]` where scroll-driven animations are missing: it writes the
 * element's `--scrub` from its scroll position each frame it is near the viewport. The range comes
 * from the element's `--scrub-from` and `--scrub-to`, as in the stylesheet.
 */
export function scrubRef(element: HTMLElement | null): (() => void) | undefined {
  if (!element || NATIVE || !('IntersectionObserver' in window)) return undefined;
  const state: Scrubbed = { element, visible: true, from: 0, to: 1 };
  readInset();
  readRange(state);
  write(state, progress(state));
  scrubbed.set(element, state);
  observer ??= new IntersectionObserver(onEntries, { rootMargin: MARGIN });
  observer.observe(element);
  stopFrames ??= onScrollFrame(readAll);
  return () => {
    scrubbed.delete(element);
    observer?.unobserve(element);
    if (scrubbed.size > 0) return;
    stopFrames?.();
    stopFrames = null;
  };
}
