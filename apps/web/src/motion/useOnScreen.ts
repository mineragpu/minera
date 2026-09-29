import { useEffect, useState, type RefObject } from 'react';

/** Whether the target currently intersects the viewport, shrunk or grown by `rootMargin`. */
export function useOnScreen(target: RefObject<Element | null>, rootMargin = '0px'): boolean {
  const [onScreen, setOnScreen] = useState(false);

  useEffect(() => {
    const element = target.current;
    if (!element) return;
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
