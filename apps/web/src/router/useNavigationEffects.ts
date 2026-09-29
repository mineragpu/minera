import { useEffect, useRef } from 'react';
import type { AppLocation } from './history.ts';

/**
 * After a navigation: scroll to the linked section, or else to the top. A new page also moves
 * focus to its heading, so keyboard and screen reader users start where the new content does.
 * A change to the query alone, such as a board filter or page, keeps the reading position.
 */
export function useNavigationEffects({ id, pathname, search, hash }: AppLocation): void {
  const previous = useRef<{ pathname: string; search: string } | null>(null);

  useEffect(() => {
    const before = previous.current;
    previous.current = { pathname, search };
    const firstLoad = before === null;
    const pathChanged = !firstLoad && before.pathname !== pathname;
    const queryChanged = !firstLoad && !pathChanged && before.search !== search;

    const sectionId = hash ? decodeURIComponent(hash.slice(1)) : '';
    const section = sectionId ? document.getElementById(sectionId) : null;
    if (section) {
      section.scrollIntoView();
      return;
    }
    if (firstLoad || queryChanged) return;
    window.scrollTo({ top: 0, behavior: pathChanged ? 'instant' : 'auto' });
    if (pathChanged) document.querySelector<HTMLElement>('main h1')?.focus({ preventScroll: true });
  }, [id, pathname, search, hash]);
}
