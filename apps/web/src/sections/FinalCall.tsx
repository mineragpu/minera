import { ButtonLink } from '../components/Button.tsx';
import { CubeGlyph } from '../components/CubeGlyph.tsx';
import { Kicker } from '../components/Kicker.tsx';
import { ArrowRightIcon } from '../components/icons.tsx';
import { ACTIVE_NETWORK_LABEL } from '../config/network.ts';
import { PATHS } from '../router/routes.ts';
import './final-call.css';

const CUBES = ['var(--teal)', 'var(--blue)', 'var(--violet)', 'var(--magenta)', 'var(--gold)'] as const;

/** The close of the home page: the two ways to start that are live now. */
export function FinalCall() {
  return (
    <section className="section shell" id="get-started" aria-labelledby="final-title">
      <div className="final">
        <div className="final__copy">
          <Kicker>Get started</Kicker>
          <h2 className="final__title" id="final-title">
            Put your GPU to work.
          </h2>
          <p className="lede">
            Deploy a rig on {ACTIVE_NETWORK_LABEL.toLowerCase()}, or ask the network a question first. Both are open
            now.
          </p>
          <div className="final__actions">
            <ButtonLink variant="primary" href={PATHS.deploy}>
              Deploy your GPU
              <ArrowRightIcon />
            </ButtonLink>
            <ButtonLink variant="ghost" href={PATHS.playground}>
              Try the playground
            </ButtonLink>
          </div>
        </div>
        <div className="final__stack" aria-hidden="true">
          {CUBES.map((color) => (
            <CubeGlyph key={color} className="final__cube" color={color} />
          ))}
        </div>
      </div>
    </section>
  );
}
