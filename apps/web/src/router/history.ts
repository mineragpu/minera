import { useSyncExternalStore } from 'react';

export interface AppLocation {
  /** Changes on every navigation, even to the same address, so effects can react to a repeat click. */
  readonly id: number;
  readonly pathname: string;
  readonly search: string;
  readonly hash: string;
}

const listeners = new Set<() => void>();
let current: AppLocation = read(0);

function read(id: number): AppLocation {
  const { pathname, search, hash } = window.location;
  return { id, pathname, search, hash };
}

function update(): void {
  current = read(current.id + 1);
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  if (listeners.size === 0) window.addEventListener('popstate', update);
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) window.removeEventListener('popstate', update);
  };
}

function snapshot(): AppLocation {
  return current;
}

export function useLocation(): AppLocation {
  return useSyncExternalStore(subscribe, snapshot, snapshot);
}

/** Moves to `to` without a page load. Another origin is loaded normally. */
export function navigate(to: string, options: { replace?: boolean } = {}): void {
  const url = new URL(to, window.location.href);
  if (url.origin !== window.location.origin) {
    window.location.assign(url.href);
    return;
  }
  const same = url.href === window.location.href;
  if (options.replace || same) window.history.replaceState(null, '', url.href);
  else window.history.pushState(null, '', url.href);
  update();
}

/**
 * Rewrites the query of the current entry, such as a job id, without counting as a navigation:
 * nothing scrolls and focus stays put.
 */
export function replaceSearch(search: string): void {
  const url = new URL(window.location.href);
  url.search = search;
  window.history.replaceState(null, '', url.href);
  current = read(current.id);
  for (const listener of listeners) listener();
}
