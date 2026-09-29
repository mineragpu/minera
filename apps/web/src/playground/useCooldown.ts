import { useEffect, useState } from 'react';

/** Whole seconds left until `until` (a timestamp in ms), counting down once a second; 0 when past. */
export function useCooldown(until: number | null): number {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (until === null) return;
    const timer = window.setInterval(() => {
      setNow(Date.now());
      if (Date.now() >= until) window.clearInterval(timer);
    }, 1000);
    return () => window.clearInterval(timer);
  }, [until]);

  return until === null ? 0 : Math.max(0, Math.ceil((until - now) / 1000));
}
