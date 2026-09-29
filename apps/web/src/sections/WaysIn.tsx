import type { ReactNode } from 'react';
import { ButtonLink } from '../components/Button.tsx';
import { CubeGlyph } from '../components/CubeGlyph.tsx';
import { Kicker } from '../components/Kicker.tsx';
import { StatusTag, type StatusTone } from '../components/StatusTag.tsx';
import { ArrowRightIcon } from '../components/icons.tsx';
import { ACTIVE_NETWORK_LABEL } from '../config/network.ts';
import { useSheenFollow } from '../motion/useSheenFollow.ts';
import { docPath } from '../pages/docs/manifest.ts';
import { PATHS, sectionPath } from '../router/routes.ts';
import './ways-in.css';

interface Way {
  audience: string;
  title: string;
  body: string;
  tone: StatusTone;
  status: string;
  color: string;
  action: { label: string; href: string };
  more?: { label: string; href: string };
}

const NETWORK = ACTIVE_NETWORK_LABEL.toLowerCase();

const WAYS: readonly Way[] = [
  {
    audience: 'GPU owners',
    title: 'Run a rig.',
    body: 'Put a GPU to work on real prompts. Run the node client, deploy the rig with one transaction, and earn from the work other operators confirm.',
    tone: 'live',
    status: `Live on ${NETWORK}`,
    color: 'var(--teal)',
    action: { label: 'Deploy a GPU', href: PATHS.deploy },
    more: { label: 'Read the quickstart', href: docPath('quickstart') },
  },
  {
    audience: 'Anyone',
    title: 'Ask the network.',
    body: 'Send a prompt from the playground and watch a rig answer it, and sometimes a second rig check it. No wallet and no GPU needed.',
    tone: 'live',
    status: `Live on ${NETWORK}`,
    color: 'var(--blue)',
    action: { label: 'Open the playground', href: PATHS.playground },
  },
  {
    audience: 'Holders and builders',
    title: 'Back a rig, or build on one.',
    body: 'Rig backing and an API for verified GPU work are planned. Neither is live yet, and neither has terms yet.',
    tone: 'planned',
    status: 'Planned',
    color: 'var(--muted)',
    action: { label: 'See the roadmap', href: sectionPath('roadmap') },
  },
];

function WayCard({ way, children }: { way: Way; children: ReactNode }) {
  const sheen = useSheenFollow<HTMLElement>();
  const titleId = `way-${way.audience.toLowerCase().replace(/\W+/g, '-')}`;
  return (
    <article ref={sheen} className={`way way--${way.tone}`} aria-labelledby={titleId}>
      <div className="way__top">
        <CubeGlyph className="way__glyph" color={way.color} />
        <StatusTag tone={way.tone}>{way.status}</StatusTag>
      </div>
      <p className="way__audience">{way.audience}</p>
      <h3 className="way__title" id={titleId}>
        {way.title}
      </h3>
      <p className="way__body">{way.body}</p>
      <div className="way__actions">{children}</div>
    </article>
  );
}

export function WaysIn({ index }: { index: string }) {
  return (
    <section className="section shell" id="ways-in" aria-labelledby="ways-title">
      <div className="split-head">
        <div>
          <Kicker index={index}>Ways in</Kicker>
          <h2 className="h2" id="ways-title">
            Three ways in.
          </h2>
        </div>
        <p className="lede">Two are open on {NETWORK} today. The third is planned, and marked that way.</p>
      </div>
      <div className="ways section-body">
        {WAYS.map((way) => (
          <WayCard key={way.audience} way={way}>
            <ButtonLink variant={way.tone === 'live' ? 'primary' : 'ghost'} size="sm" href={way.action.href}>
              {way.action.label}
              <ArrowRightIcon />
            </ButtonLink>
            {way.more && (
              <a className="text-link" href={way.more.href}>
                {way.more.label}
              </a>
            )}
          </WayCard>
        ))}
      </div>
    </section>
  );
}
