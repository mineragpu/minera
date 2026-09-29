import { errorSummary, type Logger } from './log.ts';

export interface Loop {
  /** Stop scheduling and wait for a run in progress to finish. */
  stop(): Promise<void>;
}

export interface LoopOptions {
  name: string;
  log: Logger;
  /** One unit of work; resolves the milliseconds to wait before the next run. */
  run: () => Promise<number>;
  /** The wait after a run that threw. */
  retryMs: number;
}

/** Run a background task repeatedly, never overlapping itself, until stopped. */
export function startLoop(options: LoopOptions): Loop {
  let stopped = false;
  let timer: NodeJS.Timeout | undefined;
  let current: Promise<void> = Promise.resolve();

  const tick = (): void => {
    current = (async () => {
      let delay = options.retryMs;
      try {
        delay = await options.run();
      } catch (error) {
        options.log.error({ loop: options.name, error: errorSummary(error) }, 'background task failed');
      }
      if (!stopped) timer = setTimeout(tick, Math.max(0, delay));
    })();
  };
  tick();

  return {
    async stop() {
      stopped = true;
      clearTimeout(timer);
      await current;
    },
  };
}
