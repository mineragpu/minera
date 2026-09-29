import type { ReactNode } from 'react';
import './section-head.css';

interface KickerProps {
  /** Two-digit section number. */
  index: string;
  children: ReactNode;
}

export function Kicker({ index, children }: KickerProps) {
  return (
    <p className="kicker">
      <b>{index}</b>
      <i aria-hidden="true" />
      {children}
    </p>
  );
}
