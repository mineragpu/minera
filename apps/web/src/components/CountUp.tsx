import { useRef } from 'react';
import { useCountUp } from '../motion/useCountUp.ts';

interface CountUpProps {
  /** The figure as a number, for the animation. */
  value: number;
  /** The figure as it reads at rest; its decimals set the animation's. */
  text: string;
  run: boolean;
}

export function CountUp({ value, text, run }: CountUpProps) {
  const ref = useRef<HTMLSpanElement>(null);
  useCountUp(ref, value, text, run);
  return <span ref={ref}>{text}</span>;
}
