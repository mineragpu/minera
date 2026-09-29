import type { ReactNode } from 'react';
import { useSheenFollow } from '../motion/useSheenFollow.ts';
import './chip.css';

interface RadioChipProps<T extends string> {
  id: string;
  name: string;
  value: T;
  checked: boolean;
  onSelect: (value: T) => void;
  describedBy?: string;
  children: ReactNode;
}

/** A radio input drawn as a pill; the ring and glint live on the label. */
export function RadioChip<T extends string>({ id, name, value, checked, onSelect, describedBy, children }: RadioChipProps<T>) {
  const sheen = useSheenFollow<HTMLLabelElement>();
  return (
    <>
      <input
        type="radio"
        id={id}
        name={name}
        value={value}
        checked={checked}
        onChange={() => onSelect(value)}
        aria-describedby={describedBy}
      />
      <label ref={sheen} className="chip" htmlFor={id}>
        <span className="chip__dot" aria-hidden="true" />
        {children}
        <i className="gl" aria-hidden="true" />
      </label>
    </>
  );
}
