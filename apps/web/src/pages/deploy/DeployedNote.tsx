import { BRAND, type Address } from '@minera/shared';
import { fetchRig } from '../../api/coordinator.ts';
import { usePoll } from '../../api/usePoll.ts';
import { CommandBlock } from '../../components/CommandBlock.tsx';
import { LiveDot } from '../../components/LiveDot.tsx';
import { API_BASE } from '../../config/api.ts';
import { rigPath } from '../../router/routes.ts';

const INDEX_POLL_MS = 10_000;
const START = `${BRAND.nodeClient.command} start --coordinator ${API_BASE ?? '<coordinator URL>'}`;

interface DeployedNoteProps {
  nodeKey: Address;
  name: string;
}

/** What happens after the deploy lands: indexing, the rig page, and starting the node. */
export function DeployedNote({ nodeKey, name }: DeployedNoteProps) {
  const indexed = usePoll((signal) => fetchRig(nodeKey, signal), {
    key: `indexed:${nodeKey}`,
    intervalMs: INDEX_POLL_MS,
    isFinal: () => true,
  });

  return (
    <div className="deployed">
      <p className="deployed__title">{name} is deployed.</p>
      <p>The rig appears on the board once the network has indexed it, in about a minute.</p>
      <p className="deployed__index">
        {indexed.status === 'ready' ? (
          <>
            <LiveDot />
            Indexed. The rig is on the board.
          </>
        ) : (
          'Waiting for the network to index it…'
        )}
      </p>
      <p>
        <a className="text-link" href={rigPath(nodeKey)}>
          Open the rig page
        </a>
      </p>
      <p>Now start the node on the GPU machine:</p>
      <CommandBlock label="the start command" lines={[START]} />
    </div>
  );
}
