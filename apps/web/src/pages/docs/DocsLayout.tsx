import type { ReactNode } from 'react';
import { DocsSidebar } from './DocsSidebar.tsx';
import './docs.css';

interface DocsLayoutProps {
  /** The slug of the open page, marked in the sidebar. */
  current: string;
  children: ReactNode;
}

/** The docs frame: a skip link, the page list, and the article column. */
export function DocsLayout({ current, children }: DocsLayoutProps) {
  return (
    <div className="shell docs">
      <a className="docs-skip" href="#doc-title">
        Skip to the article
      </a>
      <DocsSidebar current={current} />
      <div className="docs__main">{children}</div>
    </div>
  );
}
