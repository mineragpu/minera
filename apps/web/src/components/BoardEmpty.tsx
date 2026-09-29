import type { ReactNode } from 'react';
import './board-empty.css';

interface BoardEmptyProps {
  title: string;
  /** What to do next: a sentence, a button, or both. */
  children: ReactNode;
}

/** Stands in for a rig board with nothing to show, and says why. */
export function BoardEmpty({ title, children }: BoardEmptyProps) {
  return (
    <div className="board-empty">
      <p className="board-empty__title">{title}</p>
      {children}
    </div>
  );
}
