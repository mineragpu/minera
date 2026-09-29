import { useRef, useState } from 'react';
import './command-block.css';

interface CommandBlockProps {
  /** One command per line, copied together. */
  lines: readonly string[];
  /** Names the block for the copy button, such as "the install commands". */
  label: string;
}

function selectContents(element: HTMLElement): void {
  const range = document.createRange();
  range.selectNodeContents(element);
  const selection = window.getSelection();
  selection?.removeAllRanges();
  selection?.addRange(range);
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
