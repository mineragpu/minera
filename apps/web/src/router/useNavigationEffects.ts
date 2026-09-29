import { useEffect, useRef } from 'react';
import type { AppLocation } from './history.ts';

/**
 * After a navigation: scroll to the linked section, or else to the top. A new page also moves
 * focus to its heading, so keyboard and screen reader users start where the new content does.
 */
export function useNavigationEffects({ id, pathname, hash }: AppLocation): void {
  const previousPath = useRef<string | null>(null);

  useEffect(() => {
    const firstLoad = previousPath.current === null;
    const pathChanged = !firstLoad && previousPath.current !== pathname;
    previousPath.current = pathname;

    const sectionId = hash ? decodeURIComponent(hash.slice(1)) : '';
    const section = sectionId ? document.getElementById(sectionId) : null;
    if (section) {
      section.scrollIntoView();
      return;
    }
    if (firstLoad) return;
    window.scrollTo({ top: 0, behavior: pathChanged ? 'instant' : 'auto' });
    if (pathChanged) document.querySelector<HTMLElement>('main h1')?.focus({ preventScroll: true });
  }, [id, pathname, hash]);
}
