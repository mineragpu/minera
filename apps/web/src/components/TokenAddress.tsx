import { useEffect, useRef, useState } from 'react';
import { TOKEN } from '@minera/shared';
import { CheckIcon, CopyIcon, ExternalIcon } from './icons.tsx';
import './token-address.css';

const COPIED_MS = 1800;

interface TokenAddressProps {
  /** Also link the address on the block explorer. */
  explorer?: boolean;
  className?: string;
}

/**
 * The token's contract address, copied whole with one press, with a link to where it trades. Renders
 * nothing until the address is set in the shared package.
 */
export function TokenAddress({ explorer = false, className }: TokenAddressProps) {
  const [copied, setCopied] = useState(false);
  const code = useRef<HTMLElement>(null);
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  const address = TOKEN.address;
  if (!address) return null;

  const flash = () => {
    setCopied(true);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setCopied(false), COPIED_MS);
  };

  // Without clipboard access, select the address so a long press or Ctrl+C copies it.
  const selectAddress = () => {
    const node = code.current;
    const selection = window.getSelection();
    if (!node || !selection) return;
    const range = document.createRange();
    range.selectNodeContents(node);
    selection.removeAllRanges();
    selection.addRange(range);
  };

  const copy = () => {
    if (!navigator.clipboard) {
      selectAddress();
      return;
    }
    navigator.clipboard.writeText(address).then(flash, selectAddress);
  };

  return (
    <div className={`token-ca${className ? ` ${className}` : ''}`}>
      <span className="token-ca__ticker">${TOKEN.symbol}</span>
      <span className="token-ca__label">CA</span>
      <code className="token-ca__address" ref={code} title={address}>
        {address}
      </code>
      <button
        type="button"
        className="token-ca__copy"
        onClick={copy}
        aria-label={copied ? 'Contract address copied' : 'Copy the contract address'}
      >
        {copied ? <CheckIcon /> : <CopyIcon />}
        <span>{copied ? 'Copied' : 'Copy'}</span>
      </button>
      <span className="sr-only" aria-live="polite">
        {copied ? 'Copied the contract address.' : ''}
      </span>
      {TOKEN.marketUrl && (
        <a className="token-ca__link" href={TOKEN.marketUrl} target="_blank" rel="noreferrer">
          Pons
          <ExternalIcon />
        </a>
      )}
      {explorer && TOKEN.explorerUrl && (
        <a className="token-ca__link" href={TOKEN.explorerUrl} target="_blank" rel="noreferrer">
          Explorer
          <ExternalIcon />
        </a>
      )}
    </div>
  );
}
