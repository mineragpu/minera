import { useRef, useState } from 'react';
import { selectContents } from '../lib/selectContents.ts';
import './command-block.css';

interface CommandBlockProps {
  /** One command per line, copied together. */
  lines: readonly string[];
  /** Names the block for the copy button, such as "the install commands". */
  label: string;
}

/**
 * Commands to run in a terminal, with a copy button. Where the clipboard is unavailable, the text
 * is selected instead so the visitor can copy it by hand.
 */
export function CommandBlock({ lines, label }: CommandBlockProps) {
  const textRef = useRef<HTMLElement>(null);
  const [note, setNote] = useState('');
  const text = lines.join('\n');

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setNote('Copied.');
    } catch {
      if (textRef.current) selectContents(textRef.current);
      setNote('Selected. Press Ctrl+C to copy.');
    }
  };

  return (
    <div className="cmd">
      <pre className="cmd__text">
        <code ref={textRef}>{text}</code>
      </pre>
      <div className="cmd__bar">
        <span className="cmd__note" role="status">
          {note}
        </span>
        <button type="button" className="cmd__copy" onClick={() => void copy()}>
          Copy<span className="sr-only"> {label}</span>
        </button>
      </div>
    </div>
  );
}
