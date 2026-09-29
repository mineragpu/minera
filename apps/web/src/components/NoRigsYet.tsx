import { PATHS } from '../router/routes.ts';
import { BoardEmpty } from './BoardEmpty.tsx';
import { ButtonLink } from './Button.tsx';

/** The board before the first rig is deployed, with the way to deploy one. */
export function NoRigsYet() {
  return (
    <BoardEmpty title="No rigs are deployed yet.">
      <p>Run the node client on your GPU, then send one transaction from your wallet to put the first rig here.</p>
      <ButtonLink variant="primary" href={PATHS.deploy}>
        Deploy a rig
      </ButtonLink>
    </BoardEmpty>
  );
}
