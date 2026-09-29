import { useEffect, useState, type RefObject } from 'react';
import { useOnScreen } from './useOnScreen.ts';
import { useReducedMotion } from './useReducedMotion.ts';

interface VesselFill {
  /** The slabs restack and the figures count up; latches once started. */
  playing: boolean;
  /** Ambient motion runs only while this is true. */
  onScreen: boolean;
}

/**
 * Starts the Burn Pool fill when the vessel first comes into view, or when a link jumps to the
 * pool, so the stacking plays even when the vessel is reached by anchor.
 */
export function useVesselFill(vessel: RefObject<Element | null>): VesselFill {
  const reduced = useReducedMotion();
  const onScreen = useOnScreen(vessel, '0px 0px -8% 0px');
  const [started, setStarted] = useState(false);

  if (onScreen && !started) setStarted(true);

  useEffect(() => {
    if (started) return;
    const onClick = (event: MouseEvent) => {
      if (event.target instanceof Element && event.target.closest('a[href$="#burn-pool"]')) setStarted(true);
    };
    document.addEventListener('click', onClick);
    return () => document.removeEventListener('click', onClick);
  }, [started]);

  return { playing: started && !reduced, onScreen };
}
