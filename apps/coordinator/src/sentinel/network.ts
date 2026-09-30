import { createHmac } from 'node:crypto';
import { isIPv4, isIPv6 } from 'node:net';

const MAPPED_IPV4 = '::ffff:';

/** The eight 16-bit groups of a valid IPv6 address, including one that ends in dotted IPv4. */
function ipv6Groups(address: string): number[] {
  let text = address.toLowerCase().split('%')[0] ?? '';
  let tail: number[] = [];
  const lastColon = text.lastIndexOf(':');
  const embedded = text.slice(lastColon + 1);
  if (isIPv4(embedded)) {
    const [a = 0, b = 0, c = 0, d = 0] = embedded.split('.').map(Number);
    tail = [(a << 8) | b, (c << 8) | d];
    text = text.slice(0, lastColon + 1);
    if (!text.endsWith('::')) text = text.slice(0, -1);
  }
  const [head = '', rest] = text.split('::');
  const left = head === '' ? [] : head.split(':');
  const right = rest === undefined || rest === '' ? [] : rest.split(':');
  const fill = rest === undefined ? [] : Array<string>(8 - tail.length - left.length - right.length).fill('0');
  return [...[...left, ...fill, ...right].map((group) => Number.parseInt(group, 16)), ...tail];
}

/**
 * The subnet an address belongs to: its /24 for IPv4, its /48 for IPv6. Rigs in one subnet are
 * treated as one party. Anything that is not an IP address has no subnet.
 */
export function subnetOf(ip: string): string | null {
  const address = ip.startsWith(MAPPED_IPV4) && isIPv4(ip.slice(MAPPED_IPV4.length)) ? ip.slice(MAPPED_IPV4.length) : ip;
  if (isIPv4(address)) return `4:${address.split('.').slice(0, 3).join('.')}`;
  if (isIPv6(address)) {
    return `6:${ipv6Groups(address)
      .slice(0, 3)
      .map((group) => group.toString(16))
      .join(':')}`;
  }
  return null;
}

/**
 * A keyed digest of the subnet, so rigs can be compared by network without the coordinator
 * keeping anyone's address.
 */
export function networkKey(ip: string, salt: string): string | null {
  const subnet = subnetOf(ip);
  return subnet === null ? null : createHmac('sha256', salt).update(subnet).digest('hex').slice(0, 24);
}
