import type { ReactNode } from 'react';
import { DocsSidebar } from './DocsSidebar.tsx';
import './docs.css';

interface DocsLayoutProps {
  /** The slug of the open page, marked in the sidebar. */
  current: string;
  /** The page's own contents list, shown beside the article on wide screens. */
  toc?: ReactNode;
  children: ReactNode;
}

/** The docs frame: a skip link, the page list, the article column and the contents list. */
export function DocsLayout({ current, toc, children }: DocsLayoutProps) {
  return (
    <div className={toc ? 'shell docs docs--toc' : 'shell docs'}>
      <a className="docs-skip" href="#doc-title">
        Skip to the article
      </a>
      <DocsSidebar current={current} />
      <div className="docs__main">{children}</div>
      {toc && <div className="docs__toc">{toc}</div>}
    </div>
  );
}
