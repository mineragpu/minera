/**
 * The Deploy page's one-time pairing code: 128 random bits, kept for the tab's session so a reload
 * keeps waiting for the same machine. Whoever holds the code can read what the machine sent, which
 * is nothing secret.
 */

import { PAIRING_CODE_PATTERN } from '@minera/shared';

const STORAGE_KEY = 'minera.pairing-code';

function randomCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

/** The code this tab is waiting on, made the first time it is asked for. */
export function sessionPairingCode(): string {
  try {
    const saved = sessionStorage.getItem(STORAGE_KEY);
    if (saved !== null && PAIRING_CODE_PATTERN.test(saved)) return saved;
  } catch {
    // Storage can be blocked; a code that only lives until the reload still works.
  }
  return renewPairingCode();
}

/** A fresh code, for pairing another machine. */
export function renewPairingCode(): string {
  const code = randomCode();
  try {
    sessionStorage.setItem(STORAGE_KEY, code);
  } catch {
    // As above: the code still works for this page view.
  }
  return code;
}
