import type { Fragment, Queryable } from '../../db/client.ts';

/** Postgres returns bigint and numeric columns as strings, so values are converted explicitly. */
export function toBigInt(value: string | number | bigint): bigint {
  return BigInt(value);
}

export function toSafeNumber(value: string | number | bigint): number {
  const number = Number(value);
  if (!Number.isSafeInteger(number)) throw new RangeError(`${value} is not a safe integer`);
  return number;
}

export function toOptionalNumber(value: string | number | null): number | null {
  return value === null ? null : toSafeNumber(value);
}

/**
 * A jsonb value from anything serializable. The text cast keeps postgres.js from encoding the
 * already serialized string a second time, which it does for parameters it sees typed as jsonb.
 */
export function jsonb(db: Queryable, value: unknown): Fragment {
  return db`${JSON.stringify(value)}::text::jsonb`;
}
