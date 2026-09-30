import { DOC_GROUPS, docPath } from '../pages/docs/manifest.ts';
import { PATHS, sectionPath, type RouteName } from '../router/routes.ts';

interface NavLink {
  readonly label: string;
  readonly href: string;
  /** The route this link opens; it is marked as the current page there. */
  readonly route?: RouteName;
  /** The home section this link scrolls to; it is marked while that section is in view. */
  readonly section?: string;
  /** Listed in the top bar only while a wallet is connected, or while its page is open. */
  readonly needsWallet?: boolean;
}

/** The top bar's links, in the order they are listed. */
export const NAV_LINKS: readonly NavLink[] = [
  { label: 'Launchpad', href: PATHS.launchpad, route: 'launchpad' },
  { label: 'Burn Pool', href: sectionPath('burn-pool'), section: 'burn-pool' },
  { label: 'Playground', href: PATHS.playground, route: 'playground', section: 'playground' },
  { label: 'Claim', href: PATHS.claim, route: 'claim', needsWallet: true },
  { label: 'Docs', href: PATHS.docs, route: 'docs' },
];

interface FooterGroup {
  readonly title: string;
  readonly links: readonly { readonly label: string; readonly href: string }[];
}

/**
 * The docs pages the footer lists: every page a newcomer starts with, then the first page of each
 * later group, so each part of the docs is one click away.
 */
const FOOTER_DOCS = DOC_GROUPS.flatMap((group, position) => (position === 0 ? group.pages : group.pages.slice(0, 1)));

/** The footer is the sitemap: every page and home section, grouped, with nothing hidden. */
export const FOOTER_GROUPS: readonly FooterGroup[] = [
  {
    title: 'Product',
    links: [
      { label: 'Launchpad', href: PATHS.launchpad },
      { label: 'Deploy', href: PATHS.deploy },
      { label: 'Playground', href: PATHS.playground },
      { label: 'Claim', href: PATHS.claim },
    ],
  },
  {
    title: 'Learn',
    links: [
      { label: 'Docs', href: PATHS.docs },
      ...FOOTER_DOCS.map((page) => ({ label: page.title, href: docPath(page.slug) })),
    ],
  },
  {
    title: 'Network',
    links: [
      { label: 'Burn Pool', href: sectionPath('burn-pool') },
      { label: 'Sentinel', href: sectionPath('sentinel') },
      { label: 'Campaigns', href: sectionPath('campaigns') },
      { label: 'Live contracts', href: sectionPath('whats-live') },
      { label: 'Roadmap', href: sectionPath('roadmap') },
    ],
  },
];
