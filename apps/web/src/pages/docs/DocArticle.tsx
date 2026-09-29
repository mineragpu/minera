import type { DocContent } from 'virtual:docs';
import { Kicker } from '../../components/Kicker.tsx';
import { useCodeCopy } from './useCodeCopy.ts';
import './doc-article.css';

interface DocArticleProps {
  doc: DocContent;
  /** The title of the group the page belongs to. */
  group: string;
  summary: string;
}

/** One docs page: its title, summary and the HTML rendered from its Markdown at build time. */
export function DocArticle({ doc, group, summary }: DocArticleProps) {
  const body = useCodeCopy<HTMLDivElement>();
  return (
    <article className="doc" aria-labelledby="doc-title">
      <header className="doc__head">
        <Kicker>{group}</Kicker>
        <h1 className="doc__title" id="doc-title" tabIndex={-1}>
          {doc.title}
        </h1>
        <p className="doc__summary">{summary}</p>
      </header>
      <div className="doc-body" ref={body} dangerouslySetInnerHTML={{ __html: doc.html }} />
    </article>
  );
}
