import { useRef } from 'react';
import { useOnScreen } from '../motion/useOnScreen.ts';
import { useTypewriter } from './useTypewriter.ts';

/** Prompts a first visitor might send, typed over the empty field as examples. */
const EXAMPLES: readonly string[] = [
  'What is 7 times 48?',
  'Explain what a GPU does in two sentences.',
  'Write a haiku about a cooling fan.',
  'Name three uses for a spare graphics card.',
];

/**
 * Example prompts typed over the empty prompt field. It is decoration only: the field's own
 * placeholder carries the example for assistive tech, and the caller removes this on first focus.
 */
export function PromptTypewriter() {
  const boxRef = useRef<HTMLSpanElement>(null);
  const textRef = useRef<HTMLSpanElement>(null);
  const onScreen = useOnScreen(boxRef, '80px');
  useTypewriter(textRef, EXAMPLES, onScreen);

  return (
    <span className="typewriter" ref={boxRef} aria-hidden="true">
      <span ref={textRef} />
      <i className="typewriter__caret" />
    </span>
  );
}
