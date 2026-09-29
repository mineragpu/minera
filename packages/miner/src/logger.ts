/**
 * The only place the node client writes to the terminal.
 *
 * Text lines carry a UTC timestamp and a plain-English message. JSON lines carry the same message
 * plus machine-readable fields. Quiet mode keeps warnings, errors and command results.
 */

export type LogFormat = 'text' | 'json';
export type LogLevel = 'info' | 'warn' | 'error' | 'result';
export type LogValue = string | number | boolean | null;
export type LogFields = Readonly<Record<string, LogValue | readonly string[]>>;

export interface LogSink {
  write(chunk: string): unknown;
}

export interface LoggerOptions {
  format: LogFormat;
  quiet: boolean;
  stdout: LogSink;
  stderr: LogSink;
  now?: () => Date;
}

export interface Logger {
  info(message: string, fields?: LogFields): void;
  warn(message: string, fields?: LogFields): void;
  error(message: string, fields?: LogFields): void;
  /** What the user ran the command for. Printed in every mode, including quiet. */
  result(message: string, fields?: LogFields): void;
  /** Preformatted text such as help, printed as is in text mode. */
  print(text: string): void;
}

/**
 * Control characters and bidirectional overrides are replaced, so a GPU name, model name or
 * coordinator message cannot move the cursor or restyle the terminal.
 */
const UNSAFE_CHARACTERS = /[\u0000-\u0008\u000b-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/g;

export function sanitize(text: string): string {
  return text.replace(UNSAFE_CHARACTERS, ' ');
}

/** JSON.stringify leaves these raw, so they are written as escapes that parse back to the same text. */
const RAW_IN_JSON = /[\u007f-\u009f\u202a-\u202e\u2066-\u2069]/g;

function escapeJson(json: string): string {
  return json.replace(RAW_IN_JSON, (character) => `\\u${character.charCodeAt(0).toString(16).padStart(4, '0')}`);
}

function timestamp(date: Date): string {
  return `${date.toISOString().slice(0, 19)}Z`;
}

export function createLogger(options: LoggerOptions): Logger {
  const now = options.now ?? (() => new Date());

  function emit(level: LogLevel, message: string, fields: LogFields | undefined): void {
    if (options.quiet && level === 'info') return;
    const sink = level === 'warn' || level === 'error' ? options.stderr : options.stdout;
    const time = now();
    if (options.format === 'json') {
      sink.write(`${escapeJson(JSON.stringify({ time: time.toISOString(), level, message, ...fields }))}\n`);
      return;
    }
    const prefix = level === 'warn' ? 'warning: ' : level === 'error' ? 'error: ' : '';
    const line = sanitize(message).replace(/[\r\n]+/g, ' ');
    sink.write(`${timestamp(time)} ${prefix}${line}\n`);
  }

  return {
    info: (message, fields) => emit('info', message, fields),
    warn: (message, fields) => emit('warn', message, fields),
    error: (message, fields) => emit('error', message, fields),
    result: (message, fields) => emit('result', message, fields),
    print(text) {
      if (options.format === 'json') {
        emit('result', text, undefined);
        return;
      }
      options.stdout.write(`${sanitize(text).trimEnd()}\n`);
    },
  };
}
