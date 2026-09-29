import type { ReactNode } from 'react';
import { CheckIcon } from '../../components/icons.tsx';

interface FlowStepProps {
  number: number;
  title: string;
  done: boolean;
  children: ReactNode;
}

/** One numbered step of a flow; a finished step shows a check in place of its number. */
export function FlowStep({ number, title, done, children }: FlowStepProps) {
  const id = `step-${number}`;
  return (
    <li className={done ? 'flow-step flow-step--done' : 'flow-step'} aria-labelledby={id}>
      <span className="flow-step__marker" aria-hidden="true">
        {done ? <CheckIcon /> : String(number).padStart(2, '0')}
      </span>
      <div className="flow-step__body">
        <h2 className="flow-step__title" id={id}>
          {title}
          {done && <span className="sr-only"> (done)</span>}
        </h2>
        {children}
      </div>
    </li>
  );
}
