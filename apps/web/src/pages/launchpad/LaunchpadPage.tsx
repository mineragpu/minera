import { useEffect, useRef, useState } from 'react';
import { fetchNetwork, fetchRigs } from '../../api/coordinator.ts';
import type { RigSummary } from '../../api/schemas.ts';
import { usePoll } from '../../api/usePoll.ts';
import { BoardEmpty } from '../../components/BoardEmpty.tsx';
import { ButtonLink } from '../../components/Button.tsx';
import { LoadError } from '../../components/LoadError.tsx';
import { NoRigsYet } from '../../components/NoRigsYet.tsx';
import { RigGrid } from '../../components/RigGrid.tsx';
import { ArrowRightIcon } from '../../components/icons.tsx';
import { formatCount } from '../../lib/amount.ts';
import { useLocation } from '../../router/history.ts';
import { PATHS, sectionPath } from '../../router/routes.ts';
import { useDocumentTitle } from '../../router/useDocumentTitle.ts';
import { PageHead } from '../PageHead.tsx';
import { BoardControls } from './BoardControls.tsx';
import { BoardPager } from './BoardPager.tsx';
import { boardHref, PAGE_SIZE, readBoardState, rigQueryFor, type BoardState } from './boardQuery.ts';
import { LaunchpadFigures } from './LaunchpadFigures.tsx';
import { RankingNote } from './RankingNote.tsx';
import '../../components/form.css';
import '../../components/panel.css';
import '../../components/segmented.css';
import './launchpad-page.css';

const REFRESH_MS = 30_000;
const PLACEHOLDER_CARDS = 6;

function matchesSearch(rig: RigSummary, search: string): boolean {
  const wanted = search.trim().toLowerCase();
  if (wanted === '') return true;
  return (
    rig.name.toLowerCase().includes(wanted) ||
    rig.nodeKey.toLowerCase().includes(wanted) ||
    rig.operator.toLowerCase().includes(wanted)
  );
}

function rigCount(count: number): string {
  return `${formatCount(count)} ${count === 1 ? 'rig' : 'rigs'}`;
}

/** Where the loaded page sits in the whole board, in words. */
function summaryOf(state: BoardState, total: number, loaded: number, shown: number, searching: boolean): string {
  const paired = state.pair ? ` paired with ${state.pair.symbol}` : '';
  if (total === 0) return `No rigs${paired} on the board.`;
  if (loaded === 0) return `${rigCount(total)}${paired} on the board. This page is past the last one.`;
  const first = (state.page - 1) * PAGE_SIZE + 1;
  const range = `Showing ${formatCount(first)}–${formatCount(first + loaded - 1)} of ${rigCount(total)}${paired}.`;
  return searching
    ? `${range} ${formatCount(shown)} on this page ${shown === 1 ? 'matches' : 'match'} the search.`
    : range;
}

export function LaunchpadPage() {
  useDocumentTitle('Launchpad');
  const { search: query } = useLocation();
  const state = readBoardState(query);
  const [search, setSearch] = useState('');
  const boardRef = useRef<HTMLDivElement>(null);
  const shownPage = useRef(state.page);

  const network = usePoll(fetchNetwork, { key: 'network', intervalMs: REFRESH_MS });
  const board = usePoll((signal) => fetchRigs(rigQueryFor(state), signal), {
    key: `board:${boardHref(state)}`,
    intervalMs: REFRESH_MS,
  });

  // A page picked from the pager at the foot of the board should start at the board's top.
  useEffect(() => {
    if (shownPage.current === state.page) return;
    shownPage.current = state.page;
    const element = boardRef.current;
    if (element && element.getBoundingClientRect().top < 0) element.scrollIntoView({ block: 'start' });
  }, [state.page]);

  const data = board.data;
  const searching = search.trim() !== '';
  const shown = data ? data.rigs.filter((rig) => matchesSearch(rig, search)) : [];

  let content;
  if (!data && board.status === 'error' && board.error) {
    content = <LoadError message={board.error.message} onRetry={board.retry} />;
  } else if (!data) {
    content = <RigGrid rigs={null} placeholders={PLACEHOLDER_CARDS} />;
  } else if (data.total === 0 && !state.pair) {
    content = <NoRigsYet />;
  } else if (data.total === 0 && state.pair) {
    content = (
      <BoardEmpty title={`No rig is paired with ${state.pair.symbol} yet.`}>
        <p>
          <a className="text-link" href={boardHref({ ...state, pair: null, page: 1 })}>
            Show rigs of every pair
          </a>
          , or deploy the first one paired with {state.pair.symbol}.
        </p>
        <ButtonLink variant="ghost" href={PATHS.deploy}>
          Deploy a rig
        </ButtonLink>
      </BoardEmpty>
    );
  } else if (data.rigs.length === 0) {
    content = (
      <BoardEmpty title={`There is no page ${formatCount(state.page)}.`}>
        <p>
          The board has {rigCount(data.total)} in this view.{' '}
          <a className="text-link" href={boardHref({ ...state, page: 1 })}>
            Go to the first page
          </a>
          .
        </p>
      </BoardEmpty>
    );
  } else if (shown.length === 0) {
    content = (
      <BoardEmpty title="No rig on this page matches the search.">
        <p>The search looks at names and addresses of the rigs loaded on this page only.</p>
        <button type="button" className="text-link lp-clear" onClick={() => setSearch('')}>
          Clear the search
        </button>
      </BoardEmpty>
    );
  } else {
    content = <RigGrid rigs={shown} placeholders={PLACEHOLDER_CARDS} />;
  }

  const summary = data ? summaryOf(state, data.total, data.rigs.length, shown.length, searching) : null;

  return (
    <div className="shell">
      <PageHead kicker="Launchpad" title="Every rig on the board.">
        Each deployed rig gets a card, the way a new token does, with the verified work the network measured for it.
      </PageHead>

      <div className="page-body lp">
        <LaunchpadFigures network={network.data} error={network.error} onRetry={network.retry} />
        <BoardControls state={state} search={search} onSearch={setSearch} />

        <div className="lp-board" ref={boardRef} aria-busy={data === null}>
          <p className={data && data.total > 0 ? 'lp-summary' : 'sr-only'} role="status">
            {summary}
          </p>
          {content}
          {data && <BoardPager state={state} total={data.total} />}
        </div>

        <div className="lp-foot">
          <RankingNote rules={network.data?.rules ?? null} />
          <aside className="panel lp-cta" aria-labelledby="lp-cta-title">
            <h2 className="panel__title" id="lp-cta-title">
              Put your GPU on the board.
            </h2>
            <p>Run the node client, then send one transaction. The rig gets its card once the network indexes it.</p>
            <ButtonLink variant="primary" href={PATHS.deploy}>
              Deploy a GPU
              <ArrowRightIcon />
            </ButtonLink>
            <a className="text-link" href={sectionPath('verified-work')}>
              What counts as verified work
            </a>
          </aside>
        </div>
      </div>
    </div>
  );
}
