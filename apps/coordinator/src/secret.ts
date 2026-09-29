import { inspect } from 'node:util';

const REDACTED = '[redacted]';

/**
 * Holds a credential so that logging, serializing or inspecting the holder never prints it.
 * The value is only reachable through `reveal()`.
 */
export class Secret<T> {
  readonly #value: T;

  constructor(value: T) {
    this.#value = value;
  }

  reveal(): T {
    return this.#value;
  }

  toString(): string {
    return REDACTED;
  }

  toJSON(): string {
    return REDACTED;
  }

  [inspect.custom](): string {
    return REDACTED;
  }
}
