import { Fragment } from 'react';
import { CubeGlyph } from '../components/CubeGlyph.tsx';
import { Kicker } from '../components/Kicker.tsx';
import { Reveal } from '../components/Reveal.tsx';
import { Words } from '../components/Words.tsx';
import { revealRef } from '../motion/revealObserver.ts';
import { scrubRef } from '../motion/scrub.ts';
import './story.css';

interface Beat {
  label: string;
  title: string;
  body: string;
  tone: 'then' | 'now';
  color: string;
}

const BEATS: readonly Beat[] = [
  {
    label: 'Then',
    title: 'Power spent on hashes.',
    body: 'GPUs ran day and night on hashes: work that proved it had been done and answered no question. When that stopped paying, many rigs went dark.',
    tone: 'then',
    color: 'var(--muted)',
  },
  {
    label: 'Now',
    title: 'Power spent on answers.',
    body: 'Here a rig runs a language model and answers the prompts people send. An answer counts once a rig run by a different operator returns the same one.',
    tone: 'now',
    color: 'var(--teal)',
  },
  {
    label: 'Paid from',
    title: 'A pool that only fills.',
    body: 'Rewards come from the Burn Pool. Deposits go in one way, and leave only as pay for verified work.',
    tone: 'now',
    color: 'var(--violet)',
  },
];

/**
 * A beat's body as one span per word, in reading order. The words brighten from muted to full as the
 * beat scrolls up through the page, the way a reader's eye moves along it.
 */
function ReadingBody({ text }: { text: string }) {
  const words = text.split(' ');
  return (
    <p className="beat__body" ref={revealRef} data-reveal="fade-up" style={{ '--n': words.length }}>
      {words.map((word, index) => (
        <Fragment key={index}>
          {index > 0 && ' '}
          <span className="rw" style={{ '--wi': index }}>
            {word}
          </span>
        </Fragment>
      ))}
    </p>
  );
}

export function Story({ index }: { index: string }) {
  return (
    <section className="section shell" id="story" aria-labelledby="story-title">
      <div className="story">
        <div className="story__head" ref={revealRef} data-reveal="head">
          <Kicker index={index}>Story</Kicker>
          <h2 className="h2 story__title" id="story-title">
            <Words>The rigs are back.</Words>
          </h2>
          <Reveal as="p" className="story__close" delay={480}>
            Same cards. <span>Useful work.</span>
          </Reveal>
        </div>
        <ol className="beats">
          {BEATS.map((beat) => (
            <li key={beat.label} className={`beat beat--${beat.tone}`} ref={scrubRef} data-scrub>
              <span className="beat__node" ref={revealRef} data-reveal="scale-in" aria-hidden="true">
                <CubeGlyph color={beat.color} />
              </span>
              <p className="beat__label" ref={revealRef} data-reveal="fade">
                {beat.label}
              </p>
              <h3 className="beat__title" ref={revealRef} data-reveal="clip-up">
                {beat.title}
              </h3>
              <ReadingBody text={beat.body} />
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
