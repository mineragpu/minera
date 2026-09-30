import type { HTMLAttributes } from 'react';
import { revealRef } from '../motion/revealObserver.ts';

/** The entrances in `styles/reveal.css`. */
export type RevealVariant =
  | 'fade-up'
  | 'fade'
  | 'clip-up'
  | 'blur-in'
  | 'scale-in'
  | 'stamp'
  | 'draw'
  | 'draw-y'
  | 'wipe'
  | 'slide-l'
  | 'slide-r';

type RevealTag = 'div' | 'p' | 'span' | 'li' | 'ul' | 'figure' | 'blockquote';

interface RevealProps extends HTMLAttributes<HTMLElement> {
  as?: RevealTag;
  variant?: RevealVariant;
  /** Waits this many milliseconds more than its place in the stagger. */
  delay?: number;
}

/** An element that plays an entrance the first time it scrolls into view. */
export function Reveal({ as: Tag = 'div', variant = 'fade-up', delay, style, ...rest }: RevealProps) {
  const timing = delay === undefined ? style : { ...style, '--reveal-delay': `${delay}ms` };
  return <Tag ref={revealRef} data-reveal={variant} style={timing} {...rest} />;
}
