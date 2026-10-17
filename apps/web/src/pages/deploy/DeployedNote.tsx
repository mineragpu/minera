import { BRAND, type Address } from '@minera/shared';
import { fetchRig } from '../../api/coordinator.ts';
import { usePoll } from '../../api/usePoll.ts';
import { CommandBlock } from '../../components/CommandBlock.tsx';
import { LiveDot } from '../../components/LiveDot.tsx';
import { RIG_NETWORK_FLAG } from '../../config/network.ts';
import { rigPath } from '../../router/routes.ts';

const POLL_MS = 10_000;
const START = `${BRAND.nodeClient.command} start${RIG_NETWORK_FLAG} --keep-model`;

interface DeployedNoteProps {
  nodeKey: Address;
  name: string;
  /** The machine paired with the page and starts the node itself; otherwise it needs the start command. */
  paired: boolean;
}

/** What happens after the deploy lands: indexing, the node coming online, and the rig page. */
export function DeployedNote({ nodeKey, name, paired }: DeployedNoteProps) {
  const rig = usePoll((signal) => fetchRig(nodeKey, signal), {
    key: `deployed:${nodeKey}`,
    intervalMs: POLL_MS,
    isFinal: (detail) => detail.online,
  });
  const online = rig.data?.online === true;

  let progress: string;
  if (online) progress = 'Online. The rig is taking work.';
  else if (rig.status === 'ready') progress = paired ? 'On the board. Waiting for the node to start…' : 'On the board. Start the node below.';
  else progress = 'Waiting for the network to index it, about a minute…';

  return (
    <div className="deployed">
      <p className="deployed__title">{name} is deployed.</p>
      <p className="deployed__index" role="status">
        {online && <LiveDot />}
        {progress}
      </p>
      {paired ? (
        <p>The GPU machine starts the node on its own once the network has indexed the rig. Keep it running.</p>
      ) : (
        <>
          <p>Start the node on the GPU machine:</p>
          <CommandBlock label="the start command" lines={[START]} />
        </>
      )}
      <p>
        <a className="text-link" href={rigPath(nodeKey)}>
          Open the rig page
        </a>
      </p>
    </div>
  );
}
