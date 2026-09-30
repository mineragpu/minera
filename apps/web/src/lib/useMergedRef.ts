import { useCallback, type RefCallback } from 'react';

/** Attaches both ref callbacks to one element, and detaches both. Stable while both refs are. */
export function useMergedRef<T>(first: RefCallback<T>, second: RefCallback<T>): RefCallback<T> {
  return useCallback(
    (element: T | null) => {
      const firstCleanup = first(element);
      const secondCleanup = second(element);
      return () => {
        if (typeof firstCleanup === 'function') firstCleanup();
        else first(null);
        if (typeof secondCleanup === 'function') secondCleanup();
        else second(null);
      };
    },
    [first, second],
  );
}
