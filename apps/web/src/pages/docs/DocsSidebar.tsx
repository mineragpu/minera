import { useState } from 'react';
import { ChevronRightIcon } from '../../components/icons.tsx';
import { DOC_GROUPS, DOCS_PATH, docPath, findDoc } from './manifest.ts';

/**
 * Every docs page by group, with the open one marked. On narrow screens the list folds behind a
 * "Browse docs" button and folds again after each navigation.
 */
export function DocsSidebar({ current }: { current: string }) {
  const [openOn, setOpenOn] = useState<string | null>(null);
  const open = openOn === current;
  const currentTitle = findDoc(current)?.page.title ?? 'Page not found';

  return (
    <nav className="docs-nav" aria-label="Docs">
      <button
        type="button"
        className="docs-nav__toggle"
        aria-expanded={open}
        aria-controls="docs-nav-list"
        onClick={() => setOpenOn(open ? null : current)}
      >
        <span className="docs-nav__toggle-label">Browse docs</span>
        <span className="docs-nav__toggle-page">{currentTitle}</span>
        <ChevronRightIcon className="docs-nav__chevron" />
      </button>
      <div className={open ? 'docs-nav__list docs-nav__list--open' : 'docs-nav__list'} id="docs-nav-list">
        <a className="docs-nav__home" href={DOCS_PATH}>
          All docs
        </a>
        {DOC_GROUPS.map((group, index) => {
          const headingId = `docs-nav-group-${index + 1}`;
          return (
            <div key={group.title} className="docs-nav__group">
              <p className="docs-nav__heading" id={headingId}>
                {group.title}
              </p>
              <ul aria-labelledby={headingId}>
                {group.pages.map((page) => (
                  <li key={page.slug}>
                    <a href={docPath(page.slug)} aria-current={page.slug === current ? 'page' : undefined}>
                      {page.title}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>
    </nav>
  );
}
