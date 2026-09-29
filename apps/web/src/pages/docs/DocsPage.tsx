import { useDocumentTitle } from '../../router/useDocumentTitle.ts';
import { PageHead } from '../PageHead.tsx';
import { DocsIndex } from './DocsIndex.tsx';
import { DOC_GROUPS } from './manifest.ts';

/** `null` opens the docs index; any other slug opens that page, or a not-found note. */
export function DocsPage({ slug }: { slug: string | null }) {
  const group = slug === null ? undefined : DOC_GROUPS.find((entry) => entry.pages.some((page) => page.slug === slug));
  const page = group?.pages.find((entry) => entry.slug === slug);
  useDocumentTitle(slug === null ? 'Docs' : page ? `${page.title} · Docs` : 'Page not found · Docs');

  if (slug === null) return <DocsIndex />;
  return (
    <div className="shell">
      {group && page ? (
        <PageHead kicker={group.title} title={page.title}>
          {page.summary}
        </PageHead>
      ) : (
        <PageHead kicker="Docs" title="There is no docs page at this address.">
          The link may be mistyped, or the page may have moved. <a className="text-link" href="/docs">Browse all docs</a>
        </PageHead>
      )}
    </div>
  );
}
