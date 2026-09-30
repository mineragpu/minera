import { CubeGlyph } from '../components/CubeGlyph.tsx';
import { Kicker } from '../components/Kicker.tsx';
import { Words } from '../components/Words.tsx';
import { ChevronRightIcon } from '../components/icons.tsx';
import { revealRef } from '../motion/revealObserver.ts';
import { scrubRef } from '../motion/scrub.ts';
import './how-it-works.css';

interface Step {
  title: string;
  color: string;
  body: string;
}

const STEPS: readonly Step[] = [
  {
    title: 'Deploy',
    color: 'var(--teal)',
    body: 'Run the node client, name the rig and pick ETH or a listed stock token as its pair. One transaction puts it on the board.',
  },
  {
    title: 'Mine verified work',
    color: 'var(--blue)',
    body: 'The rig answers real prompts with a local model. Its work counts once a rig from another operator returns the same answer.',
  },
  {
    title: 'The pool pays each block',
    color: 'var(--magenta)',
    body: 'Each block, the Burn Pool pays rigs for their verified work. Rewards are the only way funds leave it.',
  },
  {
    title: 'Claim in your pair',
    color: 'var(--gold)',
    body: 'Once a settlement has passed its challenge delay, claim in the pair you picked, or in ETH at any time.',
  },
];

export function HowItWorks({ index }: { index: string }) {
  return (
    <section className="section shell" id="how-it-works" aria-labelledby="how-title">
      <div className="split-head" ref={revealRef} data-reveal="head">
        <div>
          <Kicker index={index}>How it works</Kicker>
          <h2 className="h2" id="how-title">
            <Words>Four steps, in order.</Words>
          </h2>
        </div>
        <p className="lede">From a card on your desk to a claim in the asset you picked.</p>
      </div>
      <ol className="steps" ref={scrubRef} data-scrub>
        {STEPS.map((step, index) => (
          <li key={step.title} className="step" ref={revealRef} data-reveal="fade-up" style={{ '--step': index }}>
            <span className="step__glow" aria-hidden="true" />
            <span className="step__node" aria-hidden="true">
              <CubeGlyph color={step.color} />
            </span>
            {index < STEPS.length - 1 && <ChevronRightIcon className="step__arrow" />}
            <p className="step__idx">Step {String(index + 1).padStart(2, '0')}</p>
            <h3>{step.title}</h3>
            <p>{step.body}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}
