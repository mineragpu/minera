import { timeFromNow } from '../lib/time.ts';
import { LiveDot } from './LiveDot.tsx';
import './rig-state.css';

interface RigStateProps {
  online: boolean;
  lastSeenAt: Date | null;
}

/** Whether the rig is taking work, in words, with a dot that pulses only while it is online. */
export function RigState({ online, lastSeenAt }: RigStateProps) {
  if (online) {
    return (
      <span className="rig-state rig-state--on">
        <LiveDot />
        Online
      </span>
    );
  }
  return (
    <span className="rig-state">
      <span className="rig-state__dot" aria-hidden="true" />
      {lastSeenAt ? `Offline, last seen ${timeFromNow(lastSeenAt)}` : 'Not connected yet'}
    </span>
  );
}
