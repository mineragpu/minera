import { useRef } from 'react';
import { formatNumber } from '../lib/format.ts';
import { useCountUp } from '../motion/useCountUp.ts';

interface CountUpProps {
  value: number;
  decimals: number;
  run: boolean;
}

export function CountUp({ value, decimals, run }: CountUpProps) {
  const ref = useRef<HTMLSpanElement>(null);
  useCountUp(ref, value, decimals, run);
  return <span ref={ref}>{formatNumber(value, decimals)}</span>;
}
