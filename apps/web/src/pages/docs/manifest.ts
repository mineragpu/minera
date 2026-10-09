/**
 * The docs pages, in reading order. Each slug is a Markdown file in the repository's `docs/`
 * folder; the build fails when a listed slug has no file or a file is not listed here.
 */

export interface DocEntry {
  readonly slug: string;
  readonly title: string;
  readonly summary: string;
}

export interface DocGroup {
  readonly title: string;
  readonly pages: readonly DocEntry[];
}

export const DOC_GROUPS: readonly DocGroup[] = [
  {
    title: 'Start',
    pages: [
      {
        slug: 'overview',
        title: 'Overview',
        summary: 'What the network does, what runs today and what is planned.',
      },
      {
        slug: 'quickstart',
        title: 'Quickstart: run a node',
        summary: 'Install the node client, create a node key, deploy the rig and start taking jobs.',
      },
      {
        slug: 'deploy-a-rig',
        title: 'Deploy a rig',
        summary: 'The Deploy page step by step: wallet, deploy code, name, pair and the transaction.',
      },
    ],
  },
  {
    title: 'Mining',
    pages: [
      {
        slug: 'pairs-and-claims',
        title: 'Pairs and claims',
        summary: 'Claims default to your rigs’ pair, converted from ETH as you claim. ETH always works.',
      },
      {
        slug: 'verification-and-rewards',
        title: 'Verification and rewards',
        summary: 'How work is checked and measured, and how it becomes a claimable reward.',
      },
      {
        slug: 'burn-pool',
        title: 'Burn Pool',
        summary: 'The one-way pool that pays rewards, and the limits its contract enforces.',
      },
      {
        slug: 'campaigns',
        title: 'Campaigns',
        summary: 'How the pool is refilled, and how each campaign appears on chain.',
      },
    ],
  },
  {
    title: 'Reference',
    pages: [
      {
        slug: 'contracts',
        title: 'Contracts',
        summary: 'Mainnet and testnet addresses, parameters, functions, events and errors.',
      },
      {
        slug: 'api',
        title: 'Coordinator API',
        summary: 'Every public coordinator endpoint, with the shape of its response.',
      },
      {
        slug: 'node-protocol',
        title: 'Node protocol',
        summary: 'How a node signs its requests, and the hello, heartbeat and result messages.',
      },
    ],
  },
  {
    title: 'Trust',
    pages: [
      {
        slug: 'sentinel',
        title: 'Sentinel',
        summary: 'The five gates that keep bots, scripts, fake GPUs and sybil rigs from earning.',
      },
      {
        slug: 'security',
        title: 'Security and trust',
        summary: 'Trust assumptions and known limitations, stated plainly.',
      },
      {
        slug: 'faq',
        title: 'FAQ',
        summary: 'Short answers to the questions operators and visitors ask most.',
      },
      {
        slug: 'glossary',
        title: 'Glossary',
        summary: 'The words the site, the docs and the API use, defined once.',
      },
    ],
  },
];

/** Every page in reading order, for previous and next links and for build checks. */
export const DOC_ORDER: readonly DocEntry[] = DOC_GROUPS.flatMap((group) => group.pages);

/** The docs index. */
export const DOCS_PATH = '/docs';

export function docPath(slug: string): string {
  return `${DOCS_PATH}/${slug}`;
}

/** The page at `slug` and the group it belongs to, or null for an unknown slug. */
export function findDoc(slug: string): { group: DocGroup; page: DocEntry } | null {
  for (const group of DOC_GROUPS) {
    const page = group.pages.find((entry) => entry.slug === slug);
    if (page) return { group, page };
  }
  return null;
}
