import { useEffect, useState, type RefObject } from 'react';

/**
 * The id of the heading the reader is in: the last one that has scrolled up to the top bar. At
 * the end of the page it is the last heading. Nothing is measured while `list` is not displayed.
 */
export function useActiveHeading(ids: readonly string[], list: RefObject<HTMLElement | null>): string | null {
  const [active, setActive] = useState<string | null>(null);
  const key = ids.join(' ');

  useEffect(() => {
    const headings = key === '' ? [] : key.split(' ');
    if (headings.length === 0) return;
    let frame = 0;

    const measure = () => {
      frame = 0;
      if (list.current?.offsetParent === null) return;
      const offset = parseFloat(getComputedStyle(document.documentElement).scrollPaddingTop) || 0;
      let current = headings[0] ?? null;
      for (const id of headings) {
        const top = document.getElementById(id)?.getBoundingClientRect().top;
        if (top !== undefined && top <= offset + 12) current = id;
      }
      const scroller = document.documentElement;
      if (window.scrollY > 0 && window.innerHeight + window.scrollY >= scroller.scrollHeight - 2) {
        current = headings.at(-1) ?? current;
      }
      setActive(current);
    };
    const schedule = () => {
      if (frame === 0) frame = requestAnimationFrame(measure);
    };

    measure();
    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
    };
  }, [key, list]);

  return active;
}
