import { useEffect, useRef, useState } from 'react';
import { useReducedMotion } from '../motion/useReducedMotion.ts';

/** However long the text, it is typed out within these bounds. */
const MIN_MS = 320;
const MAX_MS = 1300;
const MS_PER_CHAR = 9;

/**
 * Text that types itself out once, quickly, when it first appears. While it types, the whole text
 * is already in the page for assistive tech, and an invisible copy holds the final size so nothing
 * below it moves; once typed, it is plain text.
 */
export function TypedText({ text }: { text: string }) {
  const reduced = useReducedMotion();
  const [typed, setTyped] = useState(reduced);
  const visibleRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const element = visibleRef.current;
    if (typed || !element) return;
    const duration = Math.min(MAX_MS, Math.max(MIN_MS, text.length * MS_PER_CHAR));
    const start = performance.now();
    let frame = 0;
    const step = (now: number) => {
      const progress = Math.min(1, (now - start) / duration);
      element.textContent = text.slice(0, Math.ceil(text.length * progress));
      if (progress < 1) frame = requestAnimationFrame(step);
      else setTyped(true);
    };
    element.textContent = '';
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [typed, text]);

  if (typed) return text;
  return (
    <span className="typed">
      <span className="sr-only">{text}</span>
      <span className="typed__room" aria-hidden="true">
        {text}
      </span>
      <span className="typed__shown" aria-hidden="true">
        <span ref={visibleRef} />
        <i className="typewriter__caret" />
      </span>
    </span>
  );
}
