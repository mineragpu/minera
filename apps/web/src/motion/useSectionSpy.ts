import { useEffect, useState } from 'react';

/**
 * The id of the page section crossing the middle of the viewport, or an empty string for a
 * section without an id.
 */
export function useSectionSpy(): string {
  const [current, setCurrent] = useState('');

  useEffect(() => {
    const sections = document.querySelectorAll('main > section');
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) if (entry.isIntersecting) setCurrent(entry.target.id);
      },
      { rootMargin: '-45% 0px -50% 0px' },
    );
    sections.forEach((section) => observer.observe(section));
    return () => observer.disconnect();
  }, []);

  return current;
}
