import { Kicker } from '../../components/Kicker.tsx';
import { DOCS_PATH } from './manifest.ts';
import './doc-article.css';

export function DocNotFound() {
  return (
    <div className="doc">
      <header className="doc__head">
        <Kicker>Docs</Kicker>
        <h1 className="doc__title" id="doc-title" tabIndex={-1}>
          There is no docs page at this address.
        </h1>
        <p className="doc__summary">
          The link may be mistyped, or the page may have moved. Pick a page from the list, or{' '}
          <a className="text-link" href={DOCS_PATH}>
            browse all docs
          </a>
          .
        </p>
      </header>
    </div>
  );
}
