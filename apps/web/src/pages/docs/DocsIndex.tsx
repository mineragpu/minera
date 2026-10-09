import { PageHead } from '../PageHead.tsx';
import { ON_MAINNET } from '../../config/network.ts';
import { DOC_GROUPS, docPath } from './manifest.ts';
import './docs-index.css';

/** The docs front page: every group as a card, each page with its summary. */
export function DocsIndex() {
  return (
    <div className="shell">
      <PageHead kicker="Docs" title="How the network works, in full.">
        Run a node, deploy a rig, and check every rule the contracts and the coordinator apply. These pages describe
        the network on {ON_MAINNET ? 'mainnet' : 'testnet'} as deployed.
      </PageHead>
      <ol className="docs-groups page-body">
        {DOC_GROUPS.map((group, index) => {
          const titleId = `docs-group-${index + 1}`;
          return (
            <li key={group.title} className="docs-group" aria-labelledby={titleId}>
              <p className="docs-group__index" aria-hidden="true">
                {String(index + 1).padStart(2, '0')}
              </p>
              <h2 className="docs-group__title" id={titleId}>
                {group.title}
              </h2>
              <ul className="docs-group__pages">
                {group.pages.map((page) => (
                  <li key={page.slug}>
                    <a className="docs-group__link" href={docPath(page.slug)}>
                      <span className="docs-group__page">{page.title}</span>
                      <span className="docs-group__summary">{page.summary}</span>
                    </a>
                  </li>
                ))}
              </ul>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
