/**
 * Small decoders for checking a response against the shape the page expects. A decoder returns
 * the typed value or throws a DecodeError naming the first field that did not match.
 */

import type { Address, Hex } from '@dayagpu/shared';

export type Decoder<T> = (value: unknown, path: string) => T;

export type Decoded<D> = D extends Decoder<infer T> ? T : never;

export class DecodeError extends Error {
  override name = 'DecodeError';
}

function fail(path: string, expected: string): never {
  throw new DecodeError(`${path} should be ${expected}`);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export const string: Decoder<string> = (value, path) => (typeof value === 'string' ? value : fail(path, 'a string'));

export const boolean: Decoder<boolean> = (value, path) =>
  typeof value === 'boolean' ? value : fail(path, 'a boolean');

export const integer: Decoder<number> = (value, path) =>
  typeof value === 'number' && Number.isSafeInteger(value) ? value : fail(path, 'an integer');

/** A non-negative integer sent as a decimal string, such as an amount in wei. */
export const bigintString: Decoder<bigint> = (value, path) =>
  typeof value === 'string' && /^\d+$/.test(value) ? BigInt(value) : fail(path, 'a decimal string');

export const address: Decoder<Address> = (value, path) =>
  typeof value === 'string' && /^0x[0-9a-fA-F]{40}$/.test(value) ? (value as Address) : fail(path, 'an address');

export const hex: Decoder<Hex> = (value, path) =>
  typeof value === 'string' && /^0x[0-9a-fA-F]*$/.test(value) ? (value as Hex) : fail(path, 'hex data');

/** An ISO 8601 timestamp. */
export const timestamp: Decoder<Date> = (value, path) => {
  const date = typeof value === 'string' ? new Date(value) : null;
  return date && !Number.isNaN(date.getTime()) ? date : fail(path, 'a timestamp');
};

export function literal<const T extends string>(...allowed: readonly T[]): Decoder<T> {
  return (value, path) =>
    typeof value === 'string' && (allowed as readonly string[]).includes(value)
      ? (value as T)
      : fail(path, `one of ${allowed.join(', ')}`);
}

export function nullable<T>(decoder: Decoder<T>): Decoder<T | null> {
  return (value, path) => (value === null ? null : decoder(value, path));
}

export function array<T>(decoder: Decoder<T>): Decoder<T[]> {
  return (value, path) =>
    Array.isArray(value) ? value.map((item: unknown, index) => decoder(item, `${path}[${index}]`)) : fail(path, 'a list');
}

export function record<T>(decoder: Decoder<T>): Decoder<Record<string, T>> {
  return (value, path) => {
    if (!isRecord(value)) return fail(path, 'an object');
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, decoder(item, `${path}.${key}`)]));
  };
}

type Shape = Record<string, Decoder<unknown>>;

/** An object with at least the fields in `shape`; fields the page does not use are dropped. */
export function object<S extends Shape>(shape: S): Decoder<{ [K in keyof S]: Decoded<S[K]> }> {
  return (value, path) => {
    if (!isRecord(value)) return fail(path, 'an object');
    const result: Record<string, unknown> = {};
    for (const [key, decoder] of Object.entries(shape)) result[key] = decoder(value[key], `${path}.${key}`);
    return result as { [K in keyof S]: Decoded<S[K]> };
  };
}
