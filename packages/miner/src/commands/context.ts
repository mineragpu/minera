/**
 * What every command receives, so commands never reach for process globals and tests can run them
 * in-process against a temporary directory.
 */

import type { GpuInfo } from '@dayagpu/shared';
import type { Logger } from '../logger.ts';
import type { NodePaths } from '../paths.ts';

export interface CommandContext {
  logger: Logger;
  paths: NodePaths;
  platform: NodeJS.Platform;
  detectGpu: () => Promise<GpuInfo | null>;
  /** Calls `handler` on each interrupt or terminate signal until the returned function is called. */
  onStopSignal: (handler: () => void) => () => void;
}

export const EXIT = {
  ok: 0,
  failure: 1,
  /** No model runtime answered, so the node has nothing to run jobs on. */
  noRuntime: 2,
  usage: 64,
} as const;

export type ExitCode = (typeof EXIT)[keyof typeof EXIT];
