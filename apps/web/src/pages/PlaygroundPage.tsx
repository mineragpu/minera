import { Playground } from '../playground/Playground.tsx';
import { replaceSearch, useLocation } from '../router/history.ts';
import { useDocumentTitle } from '../router/useDocumentTitle.ts';
import { PageHead } from './PageHead.tsx';

export function PlaygroundPage() {
  useDocumentTitle('Playground');
  const { search } = useLocation();
  const jobId = new URLSearchParams(search).get('job');

  return (
    <div className="shell">
      <PageHead kicker="Playground" title="Ask the network.">
        Send a prompt to the rigs on the network, then watch it get answered and, sometimes, checked by a second rig.
        Each job keeps its own address, so you can come back to it.
      </PageHead>
      <div className="page-body">
        <Playground initialJobId={jobId} onJob={(id) => replaceSearch(`?job=${encodeURIComponent(id)}`)} />
      </div>
    </div>
  );
}
