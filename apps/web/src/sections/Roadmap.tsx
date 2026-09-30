import { CubeGlyph } from '../components/CubeGlyph.tsx';
import { Kicker } from '../components/Kicker.tsx';
import { StatusTag, type StatusTone } from '../components/StatusTag.tsx';
import { Words } from '../components/Words.tsx';
import { revealRef } from '../motion/revealObserver.ts';
import { scrubRef } from '../motion/scrub.ts';
import './roadmap.css';

interface Phase {
  name: string;
  tone: StatusTone;
  status: string;
  items: readonly string[];
  note?: string;
}

const PHASES: readonly Phase[] = [
  {
    name: 'Testnet',
    tone: 'live',
    status: 'Live now',
    items: [
      'Burn Pool, rig registry and pair zap, with verified source',
      'The network service: jobs, cross-checks and a settlement after each epoch',
      'The playground and the deploy flow',
      'Claims in the pair of your rigs, or in ETH',
    ],
  },
  {
    name: 'Token launch',
    tone: 'planned',
    status: 'Planned',
    items: [
      'The token launches while the network keeps running on testnet',
      'Its contract address is published on this site',
    ],
    note: 'No token exists yet.',
  },
  {
    name: 'Mainnet',
    tone: 'planned',
    status: 'Planned',
    items: [
      'New contracts on mainnet, and the first burn into their Burn Pool',
      'Rigs deploy and mine on mainnet',
      'Claims in the pair of your rigs, or in mainnet ETH',
    ],
    note: 'The network moves to mainnet. Test ETH has no value, and testnet balances stay on testnet.',
  },
  {
    name: 'Growth',
    tone: 'planned',
    status: 'Planned',
    items: ['A buyer API for verified GPU work', 'A browser tier, for work from a browser tab', 'Rig NFTs'],
  },
];

export function Roadmap({ index }: { index: string }) {
  return (
    <section className="section shell" id="roadmap" aria-labelledby="roadmap-title">
      <div className="split-head" ref={revealRef} data-reveal="head">
        <div>
          <Kicker index={index}>Roadmap</Kicker>
          <h2 className="h2" id="roadmap-title">
            <Words>Where it stands, and what comes next.</Words>
          </h2>
        </div>
        <p className="lede">Each phase is marked with its real status. Planned means not built or not deployed yet.</p>
      </div>
      <ol className="phases" ref={scrubRef} data-scrub>
        {PHASES.map((phase, position) => (
          <li key={phase.name} className={`phase phase--${phase.tone}`} ref={revealRef} data-reveal="fade-up">
            <span className="phase__node" aria-hidden="true">
              <CubeGlyph color={phase.tone === 'live' ? 'var(--teal)' : 'var(--muted)'} />
            </span>
            <div className="phase__head">
              <p className="phase__index">Phase {String(position + 1).padStart(2, '0')}</p>
              <StatusTag tone={phase.tone}>{phase.status}</StatusTag>
            </div>
            <h3 className="phase__name">{phase.name}</h3>
            <ul className="phase__items">
              {phase.items.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
            {phase.note && <p className="phase__note">{phase.note}</p>}
          </li>
        ))}
      </ol>
    </section>
  );
}
