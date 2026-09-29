import { useEffect } from 'react';
import { BRAND } from '@dayagpu/shared';

/** Names the tab after the page; the home page keeps the brand line. */
export function useDocumentTitle(title: string | null): void {
  useEffect(() => {
    document.title = title ? `${title} · ${BRAND.name}` : `${BRAND.name} · ${BRAND.tagline}`;
  }, [title]);
}
