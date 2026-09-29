import { lazy, Suspense, useEffect } from 'react';
import { Skeleton } from '../../components/Skeleton.tsx';
import { useDocumentTitle } from '../../router/useDocumentTitle.ts';
import { DocsIndex } from './DocsIndex.tsx';
import { findDoc } from './manifest.ts';

// The rendered pages are the bulk of the docs, so they load in their own chunk.
const loadDocsView = () => import('./DocsView.tsx');
const DocsView = lazy(() => loadDocsView().then((module) => ({ default: module.DocsView })));

function DocsLoading() {
  return (
    <div className="shell page-loading" aria-busy="true">
      <Skeleton width="min(50%, 420px)" height="2.6em" />
      <Skeleton width="min(80%, 640px)" height="1.2em" />
    </div>
  );
}

/** `null` opens the docs index; any other slug opens that page, or a not-found note. */
export function DocsPage({ slug }: { slug: string | null }) {
  const found = slug === null ? null : findDoc(slug);
  useDocumentTitle(slug === null ? 'Docs' : `${found ? found.page.title : 'Page not found'} · Docs`);

  useEffect(() => {
    // From the index, a page is one click away; fetch its chunk ahead of that click.
    if (slug === null) void loadDocsView();
  }, [slug]);

  if (slug === null) return <DocsIndex />;
  return (
    <Suspense fallback={<DocsLoading />}>
      <DocsView slug={slug} />
    </Suspense>
  );
}
