import { Fragment } from 'react';
import './words.css';

/**
 * A heading's text as one span per word, so each word can rise from its own mask. The words stay in
 * reading order with the real spaces between them, so the heading still reads as one sentence; a
 * non-breaking space keeps two words together.
 */
export function Words({ children }: { children: string }) {
  return children.split(' ').map((word, index) => (
    <Fragment key={index}>
      {index > 0 && ' '}
      <span className="w" style={{ '--w': index }}>
        <span className="w__in">{word}</span>
      </span>
    </Fragment>
  ));
}
