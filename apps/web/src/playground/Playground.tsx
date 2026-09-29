import { useState, type FormEvent } from 'react';
import { fetchNetwork, submitPrompt } from '../api/coordinator.ts';
import { ApiError } from '../api/errors.ts';
import { usePoll } from '../api/usePoll.ts';
import { Button } from '../components/Button.tsx';
import { formatCount } from '../lib/amount.ts';
import { JobResult } from './JobResult.tsx';
import { useCooldown } from './useCooldown.ts';
import '../components/form.css';
import '../components/panel.css';
import './playground.css';

const MAX_PROMPT_CHARS = 2_000;
const NETWORK_REFRESH_MS = 30_000;
/** The coordinator allows a few prompts per address each minute; without a stated wait, try again after that. */
const DEFAULT_WAIT_SECONDS = 60;

interface PlaygroundProps {
  /** A job to show at first, such as one named in the page address. */
  initialJobId?: string | null;
  /** Called with each new job's id, so a page can keep it in its address. */
  onJob?: (id: string) => void;
}

interface Problem {
  message: string;
  /** When the coordinator allows the next prompt, in ms; set for a rate limit. */
  retryAt: number | null;
}

function problemFrom(cause: unknown): Problem {
  if (cause instanceof ApiError && cause.status === 429) {
    const seconds = cause.retryAfterSeconds ?? DEFAULT_WAIT_SECONDS;
    return { message: 'You have sent too many prompts from this address.', retryAt: Date.now() + seconds * 1000 };
  }
  const message = cause instanceof ApiError ? cause.message : 'The prompt could not be sent. Try again.';
  return { message, retryAt: null };
}

/** A prompt box that sends to the network's rigs, then follows the job until it is answered. */
export function Playground({ initialJobId = null, onJob }: PlaygroundProps) {
  const [prompt, setPrompt] = useState('');
  const [jobId, setJobId] = useState<string | null>(initialJobId);
  const [sending, setSending] = useState(false);
  const [problem, setProblem] = useState<Problem | null>(null);
  const network = usePoll(fetchNetwork, { key: 'network', intervalMs: NETWORK_REFRESH_MS });
  const wait = useCooldown(problem?.retryAt ?? null);
  const length = prompt.trim().length;
  const tooLong = prompt.length > MAX_PROMPT_CHARS;

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (sending || wait > 0 || length === 0 || tooLong) return;
    setSending(true);
    setProblem(null);
    try {
      const receipt = await submitPrompt(prompt.trim());
      setJobId(receipt.id);
      setPrompt('');
      onJob?.(receipt.id);
    } catch (cause) {
      setProblem(problemFrom(cause));
    } finally {
      setSending(false);
    }
  };

  let label = 'Send prompt';
  if (sending) label = 'Sending…';
  else if (wait > 0) label = `Try again in ${wait} s`;

  return (
    <div className="playground">
      <form className="panel playground__form" onSubmit={(event) => void onSubmit(event)} noValidate>
        <p className="playground__warning" id="prompt-warning">
          Prompts are sent to independent GPU operators. Do not include private information.
        </p>
        <div className="field">
          <label className="flabel" htmlFor="prompt">
            Prompt
          </label>
          <textarea
            className="input playground__input"
            id="prompt"
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
            maxLength={MAX_PROMPT_CHARS}
            rows={4}
            aria-describedby="prompt-warning prompt-count"
          />
        </div>
        <div className="playground__bar">
          <span className="hint" id="prompt-count">
            {formatCount(prompt.length)} of {formatCount(MAX_PROMPT_CHARS)} characters
          </span>
          <Button
            variant="primary"
            size="sm"
            type="submit"
            disabled={length === 0 || tooLong || wait > 0 || sending}
            aria-busy={sending}
          >
            {label}
          </Button>
        </div>
        {problem && (
          <p className="field-status field-status--error" role="alert">
            {problem.message}
            {problem.retryAt !== null && (wait > 0 ? ` Try again in ${wait} seconds.` : ' You can send again now.')}
          </p>
        )}
      </form>
      {jobId && <JobResult key={jobId} id={jobId} rigsOnline={network.data?.rigs.online ?? null} />}
    </div>
  );
}
