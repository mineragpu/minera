import { PAIR_LISTING } from '../../config/contracts.ts';
import { boardHref, SORTS, type BoardState } from './boardQuery.ts';

interface BoardControlsProps {
  state: BoardState;
  search: string;
  onSearch: (value: string) => void;
}

/** Pair and sort are links, so each view has an address; the search filters the loaded page only. */
export function BoardControls({ state, search, onSearch }: BoardControlsProps) {
  const pairs = [null, ...PAIR_LISTING.assets];
  return (
    <div className="lp-controls">
      <nav className="lp-control" aria-labelledby="lp-pair-label">
        <p className="flabel" id="lp-pair-label">
          Pair
        </p>
        <ul className="seg">
          {pairs.map((asset) => (
            <li key={asset?.address ?? 'all'}>
              <a
                href={boardHref({ ...state, pair: asset, page: 1 })}
                aria-current={asset?.address === state.pair?.address ? 'true' : undefined}
              >
                {asset ? asset.symbol : 'All'}
              </a>
            </li>
          ))}
        </ul>
      </nav>
      <nav className="lp-control" aria-labelledby="lp-sort-label">
        <p className="flabel" id="lp-sort-label">
          Sort
        </p>
        <ul className="seg">
          {SORTS.map((option) => (
            <li key={option.value}>
              <a
                href={boardHref({ ...state, sort: option.value, page: 1 })}
                aria-current={option.value === state.sort ? 'true' : undefined}
              >
                {option.label}
              </a>
            </li>
          ))}
        </ul>
      </nav>
      <div className="lp-control lp-control--search field">
        <label className="flabel" htmlFor="lp-search">
          Search this page
        </label>
        <input
          id="lp-search"
          className="input"
          type="search"
          value={search}
          onChange={(event) => onSearch(event.target.value)}
          placeholder="Rig name or address"
          autoComplete="off"
          spellCheck={false}
        />
      </div>
    </div>
  );
}
