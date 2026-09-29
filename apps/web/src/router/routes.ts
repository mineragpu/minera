import type { Address } from '@dayagpu/shared';

export type Route =
  | { name: 'home' }
  | { name: 'launchpad' }
  | { name: 'deploy' }
  | { name: 'playground' }
  | { name: 'claim' }
  | { name: 'rig'; nodeKey: string }
  /** A null slug is the docs index. */
  | { name: 'docs'; slug: string | null }
  | { name: 'not-found' };

export type RouteName = Route['name'];

export const PATHS = {
  home: '/',
  launchpad: '/launchpad',
  deploy: '/deploy',
  playground: '/playground',
  claim: '/claim',
  docs: '/docs',
} as const;

export function rigPath(nodeKey: Address): string {
  return `/rig/${nodeKey}`;
}

/** A section of the home page, reachable from any route. */
export function sectionPath(id: string): string {
  return `/#${id}`;
}

export function matchRoute(pathname: string): Route {
  const path = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname;
  switch (path) {
    case PATHS.home:
      return { name: 'home' };
    case PATHS.launchpad:
      return { name: 'launchpad' };
    case PATHS.deploy:
      return { name: 'deploy' };
    case PATHS.playground:
      return { name: 'playground' };
    case PATHS.claim:
      return { name: 'claim' };
    case PATHS.docs:
      return { name: 'docs', slug: null };
  }
  const rig = /^\/rig\/([^/]+)$/.exec(path);
  if (rig?.[1]) return { name: 'rig', nodeKey: decodeURIComponent(rig[1]) };
  const doc = /^\/docs\/([^/]+)$/.exec(path);
  if (doc?.[1]) return { name: 'docs', slug: decodeURIComponent(doc[1]) };
  return { name: 'not-found' };
}
