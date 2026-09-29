import { CubeGlyph } from '../components/CubeGlyph.tsx';
import { Kicker } from '../components/Kicker.tsx';
import { ChevronRightIcon } from '../components/icons.tsx';
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
    body: 'The rig runs real AI inference jobs. The network checks each result before the work counts.',
  },
  {
    title: 'The pool pays each block',
    color: 'var(--magenta)',
    body: 'Each block, the Burn Pool pays rigs for their verified work. Rewards are the only way funds leave it.',
  },
  {
    title: 'Claim in your pair',
    color: 'var(--gold)',
    body: 'Rewards arrive in the asset you picked, ETH or the stock token. Claim them to your wallet at any time.',
  },
];

export function HowItWorks() {
  return (
    <section className="section shell" id="how-it-works" aria-labelledby="how-title">
      <div className="split-head">
        <div>
          <Kicker index="05">How it works</Kicker>
          <h2 className="h2" id="how-title">
            Four steps, in order.
          </h2>
        </div>
        <p className="lede">From a card on your desk to rewards in the asset you picked.</p>
      </div>
      <ol className="steps">
        {STEPS.map((step, index) => (
          <li key={step.title} className="step">
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
