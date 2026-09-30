import type { ReactNode } from 'react';
import './section-head.css';

interface KickerProps {
  /** Two-digit section number, for the numbered sections of the home page. */
  index?: string;
  children: ReactNode;
}

export function Kicker({ index, children }: KickerProps) {
  return (
    <p className="kicker">
      {index && <b>{index}</b>}
      <i aria-hidden="true" />
      <span className="kicker__text">{children}</span>
    </p>
  );
}
