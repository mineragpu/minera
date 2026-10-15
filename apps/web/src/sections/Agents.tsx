import { BRAND } from '@minera/shared';
import { ButtonLink } from '../components/Button.tsx';
import { CubeGlyph } from '../components/CubeGlyph.tsx';
import { Kicker } from '../components/Kicker.tsx';
import { SheenSpot } from '../components/SheenSpot.tsx';
import { StatusTag, type StatusTone } from '../components/StatusTag.tsx';
import { Words } from '../components/Words.tsx';
import { ArrowRightIcon } from '../components/icons.tsx';
import { ACTIVE_NETWORK_LABEL } from '../config/network.ts';
import { useMergedRef } from '../lib/useMergedRef.ts';
import { revealRef } from '../motion/revealObserver.ts';
import { useSheenFollow } from '../motion/useSheenFollow.ts';
import { docPath } from '../pages/docs/manifest.ts';
import { sectionPath } from '../router/routes.ts';
import './ways-in.css';

interface AgentWay {
  key: string;
  label: string;
  title: string;
  body: string;
  tone: StatusTone;
  status: string;
  color: string;
  action: { label: string; href: string };
}

const NETWORK = ACTIVE_NETWORK_LABEL.toLowerCase();

/** What an AI agent can do with Minera today, and what comes next, each marked as it stands. */
const AGENT_WAYS: readonly AgentWay[] = [
  {
    key: 'read',
    label: 'Read',
    title: 'Read the network.',
    body: "The Minera MCP server gives an agent seven read-only tools: the network, the rigs, the Burn Pool, settlements, claims and Sentinel's counts. No key and no account.",
    tone: 'live',
    status: 'In the repository',
    color: 'var(--teal)',
    action: { label: 'See the MCP server', href: `${BRAND.links.github}/tree/main/packages/mcp` },
  },
  {
    key: 'ask',
    label: 'Ask',
    title: 'Ask for a verified answer.',
    body: "An agent's prompt goes to two unrelated rigs every time, and the answer comes back with how it was checked: verified only when the two agree.",
    tone: 'live',
    status: `Live on ${NETWORK}`,
    color: 'var(--blue)',
    action: { label: 'Read the API', href: docPath('api') },
  },
  {
    key: 'run',
    label: 'Next',
    title: 'Run a rig.',
    body: 'An agent with its own wallet deploys a rig, keeps it serving the model the network asks for, watches its Sentinel standing and claims what it earned.',
    tone: 'planned',
    status: 'Next',
    color: 'var(--violet)',
    action: { label: 'See the roadmap', href: sectionPath('roadmap') },
  },
];

function AgentCard({ way }: { way: AgentWay }) {
  const sheen = useSheenFollow<HTMLElement>();
  const ref = useMergedRef(sheen, revealRef);
  const titleId = `agent-${way.key}`;
  return (
    <article ref={ref} className={`way way--${way.tone}`} data-reveal="fade-up" aria-labelledby={titleId}>
      <SheenSpot />
      <div className="way__top">
        <CubeGlyph className="way__glyph" color={way.color} />
        <StatusTag tone={way.tone}>{way.status}</StatusTag>
      </div>
      <p className="way__audience">{way.label}</p>
      <h3 className="way__title" id={titleId}>
        {way.title}
      </h3>
      <p className="way__body">{way.body}</p>
      <div className="way__actions">
        <ButtonLink variant={way.tone === 'live' ? 'primary' : 'ghost'} size="sm" href={way.action.href}>
          {way.action.label}
          <ArrowRightIcon />
        </ButtonLink>
      </div>
    </article>
  );
}

export function Agents({ index }: { index: string }) {
  return (
    <section className="section shell" id="agents" aria-labelledby="agents-title">
      <div className="split-head" ref={revealRef} data-reveal="head">
        <div>
          <Kicker index={index}>Agents</Kicker>
          <h2 className="h2" id="agents-title">
            <Words>Built for agents.</Words>
          </h2>
        </div>
        <p className="lede">
          AI agents can read Minera and ask it questions today. Next, agents run rigs of their own.
        </p>
      </div>
      <div className="ways section-body">
        {AGENT_WAYS.map((way) => (
          <AgentCard key={way.key} way={way} />
        ))}
      </div>
    </section>
  );
}
