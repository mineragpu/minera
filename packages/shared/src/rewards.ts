/**
 * Splitting a block's budget across accounts by verified work.
 *
 * Shares are floored per account, so the sum never exceeds the budget. The remainder stays
 * uncommitted in the pool and is released in a later block.
 */

export type Address = `0x${string}`;

export interface WorkRecord {
  account: Address;
  /** Verified work units, measured by the coordinator. Never taken from a node's own report. */
  units: bigint;
}

export function allocate(budget: bigint, work: readonly WorkRecord[]): Map<Address, bigint> {
  const unitsByAccount = new Map<Address, bigint>();
  for (const { account, units } of work) {
    if (units < 0n) throw new RangeError(`negative work units for ${account}`);
    if (units === 0n) continue;
    const key = account.toLowerCase() as Address;
    unitsByAccount.set(key, (unitsByAccount.get(key) ?? 0n) + units);
  }

  const totalUnits = [...unitsByAccount.values()].reduce((sum, units) => sum + units, 0n);
  const allocation = new Map<Address, bigint>();
  if (budget <= 0n || totalUnits === 0n) return allocation;

  for (const [account, units] of unitsByAccount) {
    const amount = (budget * units) / totalUnits;
    if (amount > 0n) allocation.set(account, amount);
  }
  return allocation;
}

/** Add a block's allocation to the cumulative entitlements a settlement commits. */
export function accumulate(
  cumulative: ReadonlyMap<Address, bigint>,
  allocation: ReadonlyMap<Address, bigint>,
): Map<Address, bigint> {
  const next = new Map(cumulative);
  for (const [account, amount] of allocation) {
    next.set(account, (next.get(account) ?? 0n) + amount);
  }
  return next;
}

export function totalOf(entitlements: ReadonlyMap<Address, bigint>): bigint {
  let total = 0n;
  for (const amount of entitlements.values()) total += amount;
  return total;
}
