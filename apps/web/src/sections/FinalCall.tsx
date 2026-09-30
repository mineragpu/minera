import { ButtonLink } from '../components/Button.tsx';
import { CubeGlyph } from '../components/CubeGlyph.tsx';
import { Kicker } from '../components/Kicker.tsx';
import { Reveal } from '../components/Reveal.tsx';
import { Words } from '../components/Words.tsx';
import { ArrowRightIcon } from '../components/icons.tsx';
import { ACTIVE_NETWORK_LABEL } from '../config/network.ts';
import { useMergedRef } from '../lib/useMergedRef.ts';
import { loopRef } from '../motion/loopGate.ts';
import { revealRef } from '../motion/revealObserver.ts';
import { useMagnetic } from '../motion/useMagnetic.ts';
import { PATHS } from '../router/routes.ts';
import './final-call.css';

const CUBES = ['var(--teal)', 'var(--blue)', 'var(--violet)', 'var(--magenta)', 'var(--gold)'] as const;

/** The close of the home page: the two ways to start that are live now. */
export function FinalCall() {
  const magnet = useMagnetic<HTMLSpanElement>();
  const stackRef = useMergedRef<HTMLDivElement>(loopRef, revealRef);

  return (
    <section className="section shell" id="get-started" aria-labelledby="final-title">
      <div className="final">
        <div className="final__copy" ref={revealRef} data-reveal="head">
          <Kicker>Get started</Kicker>
          <h2 className="final__title" id="final-title">
            <Words>Put your GPU to work.</Words>
          </h2>
          <p className="lede">
            Deploy a rig on {ACTIVE_NETWORK_LABEL.toLowerCase()}, or ask the network a question first. Both are open
            now.
          </p>
          <Reveal className="final__actions" delay={560}>
            <span className="magnet" ref={magnet}>
              <ButtonLink variant="primary" href={PATHS.deploy}>
                Deploy your GPU
                <ArrowRightIcon />
              </ButtonLink>
            </span>
            <span className="magnet" ref={magnet}>
              <ButtonLink variant="ghost" href={PATHS.playground}>
                Try the playground
              </ButtonLink>
            </span>
          </Reveal>
        </div>
        <div className="final__stack" ref={stackRef} data-reveal="stack" aria-hidden="true">
          {CUBES.map((color) => (
            <CubeGlyph key={color} className="final__cube" color={color} />
          ))}
        </div>
      </div>
    </section>
  );
}
