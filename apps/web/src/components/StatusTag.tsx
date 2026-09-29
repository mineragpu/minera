import type { ReactNode } from 'react';
import { LiveDot } from './LiveDot.tsx';
import './status-tag.css';

/** `live` is running now, `planned` is not built or not deployed yet, `none` does not exist. */
export type StatusTone = 'live' | 'planned' | 'none';

interface StatusTagProps {
  tone: StatusTone;
  /** The status in words; the color only repeats it. */
  children: ReactNode;
}

export function StatusTag({ tone, children }: StatusTagProps) {
  return (
    <span className={`status-tag status-tag--${tone}`}>
      {tone === 'live' ? <LiveDot /> : <span className="status-tag__mark" aria-hidden="true" />}
      {children}
    </span>
  );
}
