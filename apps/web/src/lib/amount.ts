const DISPLAY_DECIMALS = 6;

/**
 * An on-chain amount as text: the whole part grouped, then two to six decimals. It rounds down,
 * so a claimable amount is never overstated.
 */
export function formatAmount(value: bigint, decimals = 18): string {
  const scale = 10n ** BigInt(decimals);
  const whole = value / scale;
  const digits = (value % scale).toString().padStart(decimals, '0').slice(0, DISPLAY_DECIMALS);
  const fraction = digits.replace(/0+$/, '').padEnd(2, '0');
  if (whole === 0n && value > 0n && /^0+$/.test(digits)) return `<0.${'1'.padStart(DISPLAY_DECIMALS, '0')}`;
  return `${whole.toLocaleString('en-US')}.${fraction}`;
}

/** A count, such as verified work units, grouped in thousands. */
export function formatCount(value: bigint | number): string {
  return value.toLocaleString('en-US');
}

/** An amount as a float, for drawing and animation only; text comes from formatAmount. */
export function toFloat(value: bigint, decimals = 18): number {
  return Number(value) / 10 ** decimals;
}
