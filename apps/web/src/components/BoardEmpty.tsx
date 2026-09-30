import type { ReactNode } from 'react';
import { useMergedRef } from '../lib/useMergedRef.ts';
import { loopRef } from '../motion/loopGate.ts';
import { revealRef } from '../motion/revealObserver.ts';
import './board-empty.css';

interface BoardEmptyProps {
  title: string;
  /** What to do next: a sentence, a button, or both. */
  children: ReactNode;
}

/** Stands in for a rig board with nothing to show, and says why. */
export function BoardEmpty({ title, children }: BoardEmptyProps) {
  const ref = useMergedRef<HTMLDivElement>(loopRef, revealRef);
  return (
    <div className="board-empty" ref={ref} data-reveal="fade-up">
      <p className="board-empty__title">{title}</p>
      {children}
    </div>
  );
}
