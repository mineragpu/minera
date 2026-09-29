/**
 * Markdown to HTML for one docs page, with the conventions the docs UI relies on: the first
 * heading is the page title, h2 and h3 carry ids for anchors, tables and code blocks scroll inside
 * their own containers, and links between pages point at their routes.
 */

import { Marked, Renderer, type Tokens } from 'marked';

export interface DocHeading {
  readonly id: string;
  readonly text: string;
  readonly depth: 2 | 3;
}

interface RenderedDoc {
  readonly title: string;
  readonly html: string;
  readonly headings: readonly DocHeading[];
  /** Every link to a docs page, as `slug` or `slug#id`, for the build to check. */
  readonly docLinks: readonly string[];
  readonly problems: readonly string[];
}

const HTML_ESCAPES: Readonly<Record<string, string>> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

const CALLOUT_LABELS: Readonly<Record<string, string>> = {
  NOTE: 'Note',
  IMPORTANT: 'Important',
  WARNING: 'Warning',
};

const DOC_FILE_LINK = /^(?:\.\/)?([a-z0-9-]+)\.md(#[a-z0-9-]+)?$/;
const DOC_ROUTE_LINK = /^\/docs\/([a-z0-9-]+)(#[a-z0-9-]+)?$/;

function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (char) => HTML_ESCAPES[char] ?? char);
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function renderDoc(markdown: string, slug: string, docsPath: string): RenderedDoc {
  let title: string | null = null;
  let section = '';
  const headings: DocHeading[] = [];
  const ids = new Set<string>();
  const docLinks: string[] = [];
  const problems: string[] = [];

  const uniqueId = (text: string): string => {
    const base = slugify(text) || 'section';
    let id = base;
    for (let n = 2; ids.has(id); n += 1) id = `${base}-${n}`;
    ids.add(id);
    return id;
  };

  const docLink = (target: string, hash: string | undefined): string => {
    docLinks.push(`${target}${hash ?? ''}`);
    return `${docsPath}/${target}${hash ?? ''}`;
  };

  const marked = new Marked({ gfm: true, async: false });
  marked.use({
    renderer: {
      heading({ tokens, depth }: Tokens.Heading) {
        const inner = this.parser.parseInline(tokens);
        const text = this.parser.parseInline(tokens, this.parser.textRenderer).trim();
        if (depth === 1) {
          if (title !== null || headings.length > 0) problems.push('the page title must be its only, first heading');
          title = text;
          return '';
        }
        if (depth > 3) return `<h${depth}>${inner}</h${depth}>\n`;
        const id = uniqueId(text);
        headings.push({ id, text, depth: depth === 2 ? 2 : 3 });
        section = text;
        return `<h${depth} id="${id}">${inner}</h${depth}>\n`;
      },

      link({ href, title: linkTitle, tokens }: Tokens.Link) {
        const inner = this.parser.parseInline(tokens);
        const titleAttribute = linkTitle ? ` title="${escapeHtml(linkTitle)}"` : '';
        const file = DOC_FILE_LINK.exec(href);
        const route = DOC_ROUTE_LINK.exec(href);
        if (file?.[1] || route?.[1]) {
          const match = (file ?? route) as RegExpExecArray;
          return `<a href="${docLink(match[1] ?? '', match[2])}"${titleAttribute}>${inner}</a>`;
        }
        if (href.startsWith('#')) {
          docLinks.push(`${slug}${href}`);
          return `<a href="${escapeHtml(href)}"${titleAttribute}>${inner}</a>`;
        }
        if (/^https?:\/\//.test(href)) {
          const newTab = '<span class="sr-only"> (opens in a new tab)</span>';
          return `<a href="${escapeHtml(href)}"${titleAttribute} target="_blank" rel="noreferrer">${inner}${newTab}</a>`;
        }
        if (/^\/(?!\/)/.test(href)) return `<a href="${escapeHtml(href)}"${titleAttribute}>${inner}</a>`;
        problems.push(`unsupported link target "${href}"`);
        return inner;
      },

      code({ text, lang }: Tokens.Code) {
        const language = lang?.trim().split(/\s+/)[0] ?? '';
        const className = language ? ` class="language-${escapeHtml(language)}"` : '';
        return (
          '<div class="doc-code">' +
          `<pre tabindex="0"><code${className}>${escapeHtml(text)}</code></pre>` +
          '<div class="doc-code__bar"><span class="doc-code__note" role="status"></span>' +
          '<button type="button" class="doc-code__copy">Copy<span class="sr-only"> this code</span></button>' +
          '</div></div>\n'
        );
      },

      table(token: Tokens.Table) {
        const table = Renderer.prototype.table.call(this, token);
        const label = escapeHtml(section ? `Table: ${section}` : 'Table');
        return `<div class="doc-table" role="region" aria-label="${label}" tabindex="0">${table}</div>\n`;
      },

      blockquote({ tokens }: Tokens.Blockquote) {
        const body = this.parser.parse(tokens);
        const marker = /^<p>\[!([A-Z]+)\]\s*/.exec(body);
        const kind = marker?.[1];
        if (!marker || !kind) return `<blockquote class="doc-callout">${body}</blockquote>\n`;
        const label = CALLOUT_LABELS[kind];
        if (!label) {
          problems.push(`unknown callout "${kind}"`);
          return body;
        }
        const rest = `<p>${body.slice(marker[0].length)}`;
        return (
          `<div class="doc-callout doc-callout--${kind.toLowerCase()}" role="note">` +
          `<p class="doc-callout__label">${label}</p>${rest}</div>\n`
        );
      },

      html({ text }: Tokens.HTML | Tokens.Tag) {
        problems.push(`raw HTML is not allowed: ${text.trim().slice(0, 40)}`);
        return '';
      },
    },
  });

  const html = marked.parse(markdown, { async: false });
  if (title === null) problems.push('the page has no title heading');
  return { title: title ?? '', html, headings, docLinks, problems };
}
