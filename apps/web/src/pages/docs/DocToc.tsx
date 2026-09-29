import { useRef } from 'react';
import type { DocHeading } from 'virtual:docs';
import { useActiveHeading } from './useActiveHeading.ts';
import './doc-toc.css';

/** The page's h2 and h3 headings, with the one being read marked. Shown on wide screens only. */
export function DocToc({ headings }: { headings: readonly DocHeading[] }) {
  const list = useRef<HTMLElement>(null);
  const active = useActiveHeading(
    headings.map((heading) => heading.id),
    list,
  );
  if (headings.length === 0) return null;

  return (
    <nav className="doc-toc" aria-labelledby="doc-toc-title" ref={list}>
      <p className="doc-toc__title" id="doc-toc-title">
        On this page
      </p>
      <ul>
        {headings.map((heading) => (
          <li key={heading.id} className={heading.depth === 3 ? 'doc-toc__sub' : undefined}>
            <a href={`#${heading.id}`} aria-current={heading.id === active ? 'location' : undefined}>
              {heading.text}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
