import { BRAND, type Address } from '@minera/shared';
import { CommandBlock } from '../../components/CommandBlock.tsx';

const { package: PACKAGE, command: CLI } = BRAND.nodeClient;
const PLACEHOLDER = '0xYourWalletAddress';

export function NodeClientStep({ operator }: { operator: Address | null }) {
  const wallet = operator ?? PLACEHOLDER;
  return (
    <>
      <p className="flow-step__text">
        On the machine with the GPU, install the node client and create the rig’s key. It needs Node.js 22 or later,
        the GPU driver, and a local model runtime with at least one model downloaded.
      </p>
      <CommandBlock
        label="the install commands"
        lines={[`npm install --global ${PACKAGE}`, `${CLI} init --operator ${wallet}`]}
      />
      <p className="flow-step__text">
        It prints the node address and the deploy code. If this machine already has a node key, print the code for
        this wallet instead:
      </p>
      <CommandBlock label="the code command" lines={[`${CLI} code --operator ${wallet}`]} />
      {!operator && <p className="hint">Connect your wallet to fill in its address.</p>}
      <p className="flow-step__text">
        <a
          className="text-link"
          href={`${BRAND.links.github}/tree/main/packages/miner#readme`}
          target="_blank"
          rel="noreferrer"
        >
          Read the node client guide
        </a>
      </p>
    </>
  );
}
