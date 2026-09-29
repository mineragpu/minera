import { useEffect } from 'react';
import { DOCS, type DocContent } from 'virtual:docs';
import { useLocation } from '../../router/history.ts';
import { DocArticle } from './DocArticle.tsx';
import { DocNotFound } from './DocNotFound.tsx';
import { DocsLayout } from './DocsLayout.tsx';
import { DocToc } from './DocToc.tsx';
import { findDoc } from './manifest.ts';

const BY_SLUG: ReadonlyMap<string, DocContent> = new Map(DOCS.map((doc) => [doc.slug, doc]));

/** A docs page in the docs layout, or a not-found note there for an unknown slug. */
export function DocsView({ slug }: { slug: string }) {
  const { hash } = useLocation();
  const doc = BY_SLUG.get(slug);
  const found = findDoc(slug);

  // This chunk can arrive after the router has looked for a linked heading, so look again here.
  useEffect(() => {
    const id = hash ? decodeURIComponent(hash.slice(1)) : '';
    if (id) document.getElementById(id)?.scrollIntoView();
  }, [slug, hash]);

  if (!doc || !found) {
    return (
      <DocsLayout current={slug}>
        <DocNotFound />
      </DocsLayout>
    );
  }
  return (
    <DocsLayout current={slug} toc={<DocToc headings={doc.headings} />}>
      <DocArticle doc={doc} group={found.group.title} summary={found.page.summary} />
    </DocsLayout>
  );
}
