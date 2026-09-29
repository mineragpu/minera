export interface NavLink {
  readonly id: string;
  readonly label: string;
}

/** The sections the top bar and the footer link to, in the order they are listed. */
export const NAV_LINKS: readonly NavLink[] = [
  { id: 'launchpad', label: 'Launchpad' },
  { id: 'burn-pool', label: 'Burn Pool' },
  { id: 'campaigns', label: 'Campaigns' },
  { id: 'how-it-works', label: 'Docs' },
];
