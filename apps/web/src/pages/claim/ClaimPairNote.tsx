import { ETH_PAIR, type Address } from '@minera/shared';
import type { ApiError } from '../../api/errors.ts';
import type { RigBoard } from '../../api/schemas.ts';
import { LoadError } from '../../components/LoadError.tsx';
import { pairLabel } from '../../lib/pairLabel.ts';
import { rigPath } from '../../router/routes.ts';
import { sameAddress, type ClaimPlan } from './claimPlan.ts';

/** Rigs named when their pairs differ; the rest are counted. */
const SHORT_LIST = 5;

interface ClaimPairNoteProps {
  /** The wallet's rigs, most verified work first; null until they are read. */
  board: RigBoard | null;
  plan: ClaimPlan | null;
  error: ApiError | null;
  onRetry: () => void;
  /** The asset the claim is set to pay in, once one is chosen. */
  selected: Address | null;
}

function symbol(pair: Address): string {
  return pairLabel(pair).text;
}

/** What the visitor picked, when it differs from the default; otherwise the way back to ETH. */
function choiceSentence(defaultAsset: Address, selected: Address | null): string {
  if (selected !== null && !sameAddress(selected, defaultAsset)) {
    return ` This claim pays in ${symbol(selected)} instead, as you chose.`;
  }
  return sameAddress(defaultAsset, ETH_PAIR) ? '' : ' You can claim in ETH instead at any time.';
}

function sentence(plan: ClaimPlan, rigCount: number, selected: Address | null): string {
  const { leader, preselected } = plan;
  if (!leader) return 'This wallet operates no rigs on the board, so this claim pays in ETH.';
  const pair = symbol(leader.pair);
  const listed = sameAddress(preselected, leader.pair);
  const choice = choiceSentence(preselected, selected);

  if (plan.basis === 'mixed-pairs') {
    const lead = `${leader.name}, your rig with the most verified work`;
    if (!listed) {
      return `Your rigs pair with different assets. ${lead}, pairs with ${pair}, which this site does not list, so this claim defaults to ETH.${choice}`;
    }
    return `Your rigs pair with different assets, so this claim defaults to ${pair}, the pair of ${lead}.${choice}`;
  }

  const subject = rigCount === 1 ? 'Your rig pairs' : 'Your rigs pair';
  if (!listed) return `${subject} with ${pair}, which this site does not list, so this claim pays in ETH.${choice}`;
  const chosen = selected === null || sameAddress(selected, preselected);
  return chosen ? `${subject} with ${pair}, so this claim pays in ${pair}.${choice}` : `${subject} with ${pair}.${choice}`;
}

/** Why the claim defaults to the asset it does: the pair of the wallet's rigs, or ETH. */
export function ClaimPairNote({ board, plan, error, onRetry, selected }: ClaimPairNoteProps) {
  if (error && !board) {
    return <LoadError message={`Your rigs could not be read, so this claim defaults to ETH. ${error.message}`} onRetry={onRetry} />;
  }
  if (!board || !plan) {
    return (
      <p className="claim-pair" aria-busy="true">
        Reading this wallet’s rigs to find their pair…
      </p>
    );
  }

  const shown = board.rigs.slice(0, SHORT_LIST);
  const more = board.total - shown.length;
  return (
    <div className="claim-pair">
      <p>{sentence(plan, board.total, selected)}</p>
      {plan.basis === 'mixed-pairs' && (
        <div className="claim-rigs">
          <p id="claim-rigs-label">Your rigs:</p>
          <ul aria-labelledby="claim-rigs-label">
            {shown.map((rig) => (
              <li key={rig.nodeKey}>
                <a className="text-link" href={rigPath(rig.nodeKey)}>
                  {rig.name}
                </a>
                , paired with {symbol(rig.pair)}
              </li>
            ))}
            {more > 0 && <li>and {more} more</li>}
          </ul>
        </div>
      )}
    </div>
  );
}
