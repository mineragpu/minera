import { useEffect, type RefObject } from 'react';
import { useReducedMotion } from './useReducedMotion.ts';

/** The grid moves at 70 % of page speed. */
const LAG = 0.3;

/**
 * Scrolls the background grid slower than the page. The offset wraps at one lattice tile, so the
 * grid never drifts out of its frame.
 */
export function useLatticeParallax(grid: RefObject<HTMLElement | null>): void {
  const reduced = useReducedMotion();

  useEffect(() => {
    const element = grid.current;
    if (!element || reduced) return;
    const tile = Number.parseFloat(getComputedStyle(element).getPropertyValue('--lattice-size')) || 96;
    let frame = 0;

    const draw = () => {
      frame = 0;
      element.style.transform = `translate3d(0,${((window.scrollY * LAG) % tile).toFixed(1)}px,0)`;
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(draw);
    };

    window.addEventListener('scroll', onScroll, { passive: true });
    draw();
    return () => {
      window.removeEventListener('scroll', onScroll);
      if (frame) cancelAnimationFrame(frame);
      element.style.transform = '';
    };
  }, [grid, reduced]);
}
