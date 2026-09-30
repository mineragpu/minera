import { Kicker } from '../components/Kicker.tsx';
import { Words } from '../components/Words.tsx';
import { revealRef } from '../motion/revealObserver.ts';
import { Playground } from '../playground/Playground.tsx';

export function PlaygroundSection({ index }: { index: string }) {
  return (
    <section className="section shell" id="playground" aria-labelledby="playground-title">
      <div className="split-head" ref={revealRef} data-reveal="head">
        <div>
          <Kicker index={index}>Playground</Kicker>
          <h2 className="h2" id="playground-title">
            <Words>Ask the network.</Words>
          </h2>
        </div>
        <p className="lede">
          Send a prompt to the rigs on the network, then watch it get answered and, sometimes, checked by a second
          rig.
        </p>
      </div>
      <div className="section-body">
        <Playground />
      </div>
    </section>
  );
}
