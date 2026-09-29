/** The docs pages, rendered from the repository's Markdown at build time by `plugins/docs`. */
declare module 'virtual:docs' {
  export interface DocHeading {
    readonly id: string;
    readonly text: string;
    readonly depth: 2 | 3;
  }

  export interface DocContent {
    readonly slug: string;
    readonly title: string;
    /** Trusted HTML: built from the repository's own files, with raw HTML refused. */
    readonly html: string;
    readonly headings: readonly DocHeading[];
  }

  /** In manifest order. */
  export const DOCS: readonly DocContent[];
}
