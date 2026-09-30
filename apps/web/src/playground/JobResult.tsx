import { fetchPlaygroundJob } from '../api/coordinator.ts';
import type { PlaygroundJob, PlaygroundStatus } from '../api/schemas.ts';
import { usePoll } from '../api/usePoll.ts';
import { LoadError } from '../components/LoadError.tsx';
import { Skeleton } from '../components/Skeleton.tsx';
import { rigPath } from '../router/routes.ts';
import { TypedText } from './TypedText.tsx';

const JOB_POLL_MS = 2_000;

/** What each of the coordinator's job statuses means, in a sentence. */
const STATUS_TEXT: Readonly<Record<PlaygroundStatus, string>> = {
  queued: 'Waiting for a rig to take it.',
  running: 'A rig is working on it.',
  checking: 'An answer is in. A second rig is answering the same prompt so the two can be compared.',
  done: 'Answered.',
  expired: 'No rig answered in time. Send it again later.',
};

function isFinal(job: PlaygroundJob): boolean {
  return job.status === 'done' || job.status === 'expired';
}

interface JobResultProps {
  id: string;
  /** Rigs online now, from the network figures; null until known. */
  rigsOnline: number | null;
}

function Answer({ job }: { job: PlaygroundJob }) {
  return (
    <>
      <div className="answer">
        <TypedText text={job.output ?? 'The rig returned no text.'} />
      </div>
      <dl className="job-facts">
        <div>
          <dt>Answered by</dt>
          <dd>
            {job.rig ? (
              <a className="text-link" href={rigPath(job.rig.nodeKey)}>
                {job.rig.name}
              </a>
            ) : (
              'A rig no longer on the board'
            )}
          </dd>
        </div>
        <div>
          <dt>Cross-checked</dt>
          <dd>{job.crossChecked ? 'Yes' : 'No'}</dd>
        </div>
        <div>
          <dt>Verification</dt>
          <dd>
            <span className="job-tag">{job.verification}</span>
          </dd>
        </div>
      </dl>
    </>
  );
}

/** A submitted prompt, polled until it is answered or expires. */
export function JobResult({ id, rigsOnline }: JobResultProps) {
  const job = usePoll((signal) => fetchPlaygroundJob(id, signal), { key: `job:${id}`, intervalMs: JOB_POLL_MS, isFinal });
  const data = job.data;

  return (
    <section className="job" aria-labelledby="job-title">
      <div className="job__head">
        <h3 className="job__title" id="job-title">
          Your prompt
        </h3>
        {data && <span className={`job-tag job-tag--${data.status}`}>{data.status}</span>}
      </div>
      <p className="job__id">
        Job <a className="text-link" href={`/playground?job=${encodeURIComponent(id)}`}>{id}</a>
      </p>
      {job.status === 'error' && job.error && <LoadError message={job.error.message} onRetry={job.retry} />}
      {job.status === 'loading' && <Skeleton width="60%" />}
      {data && (
        <>
          <blockquote className="job__prompt">{data.prompt}</blockquote>
          <p className="job__status" role="status">
            {STATUS_TEXT[data.status]}
            {data.status === 'queued' && rigsOnline === 0 && ' No rigs are online to take this yet.'}
          </p>
          {data.status === 'done' && <Answer job={data} />}
          <p className="job__rule">{data.rule}</p>
        </>
      )}
    </section>
  );
}
