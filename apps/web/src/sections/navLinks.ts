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

/** The footer lists every page and section, with nothing hidden. */
export const FOOTER_LINKS: readonly NavLink[] = [
  { label: 'Deploy', href: PATHS.deploy },
  { label: 'Launchpad', href: PATHS.launchpad },
  { label: 'Burn Pool', href: sectionPath('burn-pool') },
  { label: 'Playground', href: PATHS.playground },
  { label: 'Claim', href: PATHS.claim },
  { label: 'Campaigns', href: sectionPath('campaigns') },
  { label: 'Docs', href: PATHS.docs },
];
