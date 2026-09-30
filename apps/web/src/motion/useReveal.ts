import { useCallback, useState, type RefCallback } from 'react';
import { observeReveal } from './revealObserver.ts';

/**
 * A reveal ref, plus whether the element has been revealed. Use it where something else waits for
 * the entrance, such as a count-up; `revealRef` alone is enough for a styled entrance.
 */
export function useReveal<T extends Element>(): [RefCallback<T>, boolean] {
  const [revealed, setRevealed] = useState(false);
  const ref = useCallback((element: T | null) => (element ? observeReveal(element, () => setRevealed(true)) : undefined), []);
  return [ref, revealed];
}
