import { useEffect } from 'react';
import type { NetworkView } from '../../api/schemas.ts';
import { formatCount } from '../../lib/amount.ts';
import { useNow } from './useNow.ts';

interface EpochCountdownProps {
  epoch: NetworkView['epoch'];
  /** Called once when this epoch's end passes, so the caller can read the next one. */
  onEnded: () => void;
}

function twoDigits(value: number): string {
  return String(value).padStart(2, '0');
}

/** `42:07`, or `1:02:07` once an hour or more is left. */
function clock(milliseconds: number): string {
  const total = Math.ceil(milliseconds / 1000);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  return hours > 0 ? `${hours}:${twoDigits(minutes)}:${twoDigits(seconds)}` : `${minutes}:${twoDigits(seconds)}`;
}

function timeOfDay(date: Date): string {
  return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

/** The time left in the current epoch, ticking each second, with a rail of how much has passed. */
export function EpochCountdown({ epoch, onEnded }: EpochCountdownProps) {
  const now = useNow(1000);
  const length = epoch.endsAt.getTime() - epoch.startedAt.getTime();
  const left = Math.max(0, epoch.endsAt.getTime() - now);
  const passed = length > 0 ? Math.min(1, 1 - left / length) : 1;
  const ended = left === 0;

  useEffect(() => {
    if (ended) onEnded();
  }, [ended, epoch.index, onEnded]);

  return (
    <div className="countdown">
      <p className="countdown__value">
        <span aria-hidden="true">{clock(left)}</span>
        <span className="sr-only">Ends at {timeOfDay(epoch.endsAt)}</span>
      </p>
      <div className="countdown__rail" aria-hidden="true">
        <span style={{ transform: `scaleX(${passed.toFixed(4)})` }} />
      </div>
      <p className="countdown__note">
        Epoch {formatCount(epoch.index)} · ends at {timeOfDay(epoch.endsAt)}
      </p>
    </div>
  );
}
