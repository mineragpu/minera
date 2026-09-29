import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { Plugin } from 'vite';
import { DOC_ORDER, DOCS_PATH } from '../../src/pages/docs/manifest.ts';
import { copyProblems } from './copyRules.ts';
import { placeholderValues, resolvePlaceholders } from './placeholders.ts';
import { renderDoc, type DocHeading } from './render.ts';

const VIRTUAL_ID = 'virtual:docs';
const RESOLVED_ID = `\0${VIRTUAL_ID}`;

interface DocContent {
  slug: string;
  title: string;
  html: string;
  headings: readonly DocHeading[];
}

/** Reads, checks and renders every page, or throws one error that lists every problem found. */
function buildDocs(directory: string, apiBase: string | undefined): DocContent[] {
  const values = placeholderValues(apiBase);
  const problems: string[] = [];
  const listed = new Set(DOC_ORDER.map((page) => page.slug));
  for (const file of readdirSync(directory)) {
    if (file.endsWith('.md') && !listed.has(file.slice(0, -3))) {
      problems.push(`docs/${file} is not listed in the docs manifest`);
    }
  }

  const pages: DocContent[] = [];
  const links: { from: string; to: string }[] = [];
  for (const entry of DOC_ORDER) {
    const file = `docs/${entry.slug}.md`;
    let source: string;
    try {
      source = readFileSync(join(directory, `${entry.slug}.md`), 'utf8');
    } catch {
      problems.push(`${file} is missing; the docs manifest lists "${entry.slug}"`);
      continue;
    }
    const resolved = resolvePlaceholders(source, values);
    for (const name of resolved.unknown) problems.push(`${file} uses an unresolved placeholder: ${name}`);
    for (const problem of copyProblems(resolved.text)) problems.push(`${file} ${problem}`);

    const doc = renderDoc(resolved.text, entry.slug, DOCS_PATH);
    for (const problem of doc.problems) problems.push(`${file}: ${problem}`);
    if (doc.title !== entry.title) {
      problems.push(`${file} is titled "${doc.title}", but the manifest says "${entry.title}"`);
    }
    for (const to of doc.docLinks) links.push({ from: file, to });
    pages.push({ slug: entry.slug, title: entry.title, html: doc.html, headings: doc.headings });
  }

  const bySlug = new Map(pages.map((page) => [page.slug, page]));
  for (const { from, to } of links) {
    const [slug = '', anchor] = to.split('#');
    const target = bySlug.get(slug);
    if (!target) problems.push(`${from} links to a docs page that does not exist: ${to}`);
    else if (anchor && !target.headings.some((heading) => heading.id === anchor)) {
      problems.push(`${from} links to a heading that does not exist: ${to}`);
    }
  }

  if (problems.length > 0) throw new Error(`The docs cannot be built:\n- ${problems.join('\n- ')}`);
  return pages;
}

/**
 * Renders the repository's Markdown docs at build time and serves them as `virtual:docs`. The
 * build fails on a missing page, an unresolved placeholder, a broken docs link or a copy rule.
 *
 * @param docsDirectory The Markdown folder, relative to the Vite root.
 */
export function docsPlugin(docsDirectory: string): Plugin {
  let directory = docsDirectory;
  let apiBase: string | undefined;
  let pages: DocContent[] | null = null;
  return {
    name: 'docs',
    configResolved(config) {
      directory = resolve(config.root, docsDirectory);
      const value: unknown = config.env['VITE_API_BASE'];
      apiBase = typeof value === 'string' ? value : undefined;
    },
    // Checked on every build, so a broken page fails it even before any route imports the docs.
    buildStart() {
      pages = buildDocs(directory, apiBase);
      for (const entry of DOC_ORDER) this.addWatchFile(join(directory, `${entry.slug}.md`));
    },
    resolveId(id) {
      return id === VIRTUAL_ID ? RESOLVED_ID : undefined;
    },
    load(id) {
      if (id !== RESOLVED_ID) return undefined;
      pages ??= buildDocs(directory, apiBase);
      return `export const DOCS = ${JSON.stringify(pages)};\n`;
    },
    configureServer(server) {
      server.watcher.add(directory);
      server.watcher.on('all', (_event, file) => {
        if (!resolve(file).startsWith(directory) || !file.endsWith('.md')) return;
        pages = null;
        const module = server.moduleGraph.getModuleById(RESOLVED_ID);
        if (module) server.moduleGraph.invalidateModule(module);
        server.ws.send({ type: 'full-reload' });
      });
    },
  };
}
