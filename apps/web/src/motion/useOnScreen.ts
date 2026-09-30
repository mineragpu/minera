import { useEffect, useState, type RefObject } from 'react';

/**
 * Whether the target currently intersects the viewport, shrunk or grown by `rootMargin`. Where
 * IntersectionObserver is missing it always reads true, so nothing waits on it.
 */
export function useOnScreen(target: RefObject<Element | null>, rootMargin = '0px'): boolean {
  const [onScreen, setOnScreen] = useState(() => !('IntersectionObserver' in window));

  useEffect(() => {
    const element = target.current;
    if (!element || !('IntersectionObserver' in window)) return;
    const observer = new IntersectionObserver(
      (entries) => {
        const latest = entries[entries.length - 1];
        if (latest) setOnScreen(latest.isIntersecting);
      },
      { rootMargin },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [target, rootMargin]);

  return onScreen;
}
