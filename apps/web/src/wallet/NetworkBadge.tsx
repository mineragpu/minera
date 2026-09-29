import { ACTIVE_CHAIN, ACTIVE_NETWORK_LABEL } from '../config/network.ts';
import './network-badge.css';

interface NetworkBadgeProps {
  correct: boolean;
  /** Show the full chain name instead of the short network label. */
  full?: boolean;
}

export function NetworkBadge({ correct, full = false }: NetworkBadgeProps) {
  if (!correct) return <span className="net-badge net-badge--wrong">Wrong network</span>;
  return (
    <span className="net-badge" title={ACTIVE_CHAIN.name}>
      {full ? ACTIVE_CHAIN.name : ACTIVE_NETWORK_LABEL}
    </span>
  );
}
