import { formatCount } from '../../lib/amount.ts';
import { boardHref, PAGE_SIZE, type BoardState } from './boardQuery.ts';

interface BoardPagerProps {
  state: BoardState;
  total: number;
}

/** Previous and next pages of the board, as links that keep the pair and sort. */
export function BoardPager({ state, total }: BoardPagerProps) {
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  if (pages <= 1 && state.page === 1) return null;
  const previous = state.page > 1 ? boardHref({ ...state, page: Math.min(state.page - 1, pages) }) : null;
  const next = state.page < pages ? boardHref({ ...state, page: state.page + 1 }) : null;

  return (
    <nav className="lp-pager" aria-label="Board pages">
      {previous ? (
        <a className="lp-pager__link" href={previous} rel="prev">
          Previous
        </a>
      ) : (
        <span className="lp-pager__link" aria-disabled="true">
          Previous
        </span>
      )}
      <p className="lp-pager__where">
        Page {formatCount(state.page)} of {formatCount(pages)}
      </p>
      {next ? (
        <a className="lp-pager__link" href={next} rel="next">
          Next
        </a>
      ) : (
        <span className="lp-pager__link" aria-disabled="true">
          Next
        </span>
      )}
    </nav>
  );
}
