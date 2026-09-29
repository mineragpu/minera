const configured: unknown = import.meta.env.VITE_API_BASE;

function parseBase(value: unknown): string | null {
  if (typeof value !== 'string' || value.trim() === '') return null;
  try {
    const url = new URL(value.trim());
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
    return url.href.replace(/\/+$/, '');
  } catch {
    return null;
  }
}

/** The coordinator this build reads from, fixed at build time by VITE_API_BASE; null without one. */
export const API_BASE: string | null = parseBase(configured);
