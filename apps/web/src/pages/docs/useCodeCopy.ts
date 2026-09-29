import { useEffect, useRef, type RefObject } from 'react';
import { selectContents } from '../../lib/selectContents.ts';

async function copyBlock(code: HTMLElement, note: Element): Promise<void> {
  try {
    await navigator.clipboard.writeText(code.textContent ?? '');
    note.textContent = 'Copied.';
  } catch {
    selectContents(code);
    note.textContent = 'Selected. Press Ctrl+C to copy.';
  }
}

/**
 * Makes the copy buttons in build-time HTML work, with one listener on the container. Where the
 * clipboard is unavailable, the code is selected instead so it can be copied by hand.
 */
export function useCodeCopy<T extends HTMLElement>(): RefObject<T | null> {
  const ref = useRef<T>(null);

  useEffect(() => {
    const root = ref.current;
    if (!root) return;
    const onClick = (event: MouseEvent) => {
      if (!(event.target instanceof Element)) return;
      const block = event.target.closest('.doc-code__copy')?.closest('.doc-code');
      const code = block?.querySelector('code');
      const note = block?.querySelector('.doc-code__note');
      if (code && note) void copyBlock(code, note);
    };
    root.addEventListener('click', onClick);
    return () => root.removeEventListener('click', onClick);
  }, []);

  return ref;
}
