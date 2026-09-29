import { ChevronRightIcon } from '../../components/icons.tsx';
import { DOC_ORDER, docPath } from './manifest.ts';
import './doc-pager.css';

/** Links to the pages before and after this one, in reading order. */
export function DocPager({ slug }: { slug: string }) {
  const index = DOC_ORDER.findIndex((page) => page.slug === slug);
  const previous = index > 0 ? DOC_ORDER[index - 1] : undefined;
  const next = index >= 0 ? DOC_ORDER[index + 1] : undefined;
  if (!previous && !next) return null;

  return (
    <nav className="doc-pager" aria-label="Previous and next page">
      {previous && (
        <a className="doc-pager__link doc-pager__link--previous" href={docPath(previous.slug)} rel="prev">
          <span className="doc-pager__direction">
            <ChevronRightIcon className="doc-pager__icon" />
            Previous
          </span>
          <span className="doc-pager__title">{previous.title}</span>
        </a>
      )}
      {next && (
        <a className="doc-pager__link doc-pager__link--next" href={docPath(next.slug)} rel="next">
          <span className="doc-pager__direction">
            Next
            <ChevronRightIcon className="doc-pager__icon" />
          </span>
          <span className="doc-pager__title">{next.title}</span>
        </a>
      )}
    </nav>
  );
}
