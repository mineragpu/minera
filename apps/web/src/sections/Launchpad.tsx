import { fetchRigs } from '../api/coordinator.ts';
import type { RigBoard } from '../api/schemas.ts';
import { usePoll } from '../api/usePoll.ts';
import { ButtonLink } from '../components/Button.tsx';
import { Kicker } from '../components/Kicker.tsx';
import { LoadError } from '../components/LoadError.tsx';
import { NoRigsYet } from '../components/NoRigsYet.tsx';
import { Reveal } from '../components/Reveal.tsx';
import { RigGrid } from '../components/RigGrid.tsx';
import { Skeleton } from '../components/Skeleton.tsx';
import { Words } from '../components/Words.tsx';
import { ArrowRightIcon } from '../components/icons.tsx';
import { formatCount } from '../lib/amount.ts';
import { revealRef } from '../motion/revealObserver.ts';
import { PATHS } from '../router/routes.ts';
import './launchpad.css';

const REFRESH_MS = 30_000;
const PREVIEW_RIGS = 6;

function loadTopRigs(signal: AbortSignal): Promise<RigBoard> {
  return fetchRigs({ sort: 'epoch', pair: null, limit: PREVIEW_RIGS, offset: 0 }, signal);
}

/** The top of the board on the home page; the launchpad page has the rest. */
export function Launchpad({ index }: { index: string }) {
  const board = usePoll(loadTopRigs, { key: 'rigs:top', intervalMs: REFRESH_MS });
  const data = board.data;

  let content;
  if (!data && board.status === 'error' && board.error) {
    content = <LoadError message={board.error.message} onRetry={board.retry} />;
  } else if (!data) {
    content = <RigGrid rigs={null} placeholders={3} />;
  } else if (data.total === 0) {
    content = <NoRigsYet />;
  } else {
    content = <RigGrid rigs={data.rigs} placeholders={PREVIEW_RIGS} />;
  }

  return (
    <section className="section shell" id="launchpad" aria-labelledby="board-title">
      <div className="board__head" ref={revealRef} data-reveal="head">
        <div>
          <Kicker index={index}>Launchpad</Kicker>
          <h2 className="h2" id="board-title">
            <Words>Rigs on the board.</Words>
          </h2>
          <p className="lede">
            Each deployed rig gets a card, the way a new token does. These are the rigs with the most verified work
            this epoch, counted by the network, never by the rig.
          </p>
        </div>
        <Reveal className="tools" delay={420}>
          <p className="board-count" aria-busy={data === null}>
            {data ? `${formatCount(data.total)} deployed` : <Skeleton width="10ch" />}
          </p>
          <ButtonLink variant="ghost" href={PATHS.launchpad}>
            Open the launchpad
            <ArrowRightIcon />
          </ButtonLink>
        </Reveal>
      </div>

      <div className="board">{content}</div>
      {data && data.total > data.rigs.length && (
        <Reveal as="p" className="board-note" variant="fade">
          Showing the top {formatCount(data.rigs.length)} of {formatCount(data.total)} rigs.{' '}
          <a className="text-link" href={`${PATHS.launchpad}?sort=epoch`}>
            See the whole board
          </a>
        </Reveal>
      )}
    </section>
  );
}
