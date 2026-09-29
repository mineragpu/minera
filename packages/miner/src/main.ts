/**
 * Parses the command line, sets up output and runs one command. Returns the process exit code.
 */

import { parseCommandLine, USAGE } from './args.ts';
import { codeCommand } from './commands/code.ts';
import { EXIT, type CommandContext, type ExitCode } from './commands/context.ts';
import { initCommand } from './commands/init.ts';
import { startCommand } from './commands/start.ts';
import { statusCommand } from './commands/status.ts';
import { detectGpu } from './gpu.ts';
import { createLogger, type LogSink } from './logger.ts';
import { currentPathEnvironment, nodePaths, type PathEnvironment } from './paths.ts';
import { CLIENT_VERSION } from './version.ts';

export interface MainEnvironment {
  stdout: LogSink;
  stderr: LogSink;
  paths: PathEnvironment;
  detectGpu: CommandContext['detectGpu'];
  onStopSignal: CommandContext['onStopSignal'];
}

function onProcessStopSignal(handler: () => void): () => void {
  process.on('SIGINT', handler);
  process.on('SIGTERM', handler);
  return () => {
    process.off('SIGINT', handler);
    process.off('SIGTERM', handler);
  };
}

export function processEnvironment(): MainEnvironment {
  return {
    stdout: process.stdout,
    stderr: process.stderr,
    paths: currentPathEnvironment(),
    detectGpu: () => detectGpu(),
    onStopSignal: onProcessStopSignal,
  };
}

export async function main(argv: readonly string[], environment: MainEnvironment): Promise<ExitCode> {
  const parsed = parseCommandLine(argv);
  const logger = createLogger({
    format: parsed.output.json ? 'json' : 'text',
    quiet: parsed.output.quiet,
    stdout: environment.stdout,
    stderr: environment.stderr,
  });
  if (!parsed.ok) {
    logger.error(parsed.error);
    return EXIT.usage;
  }

  const context: CommandContext = {
    logger,
    paths: nodePaths(environment.paths),
    platform: environment.paths.platform,
    detectGpu: environment.detectGpu,
    onStopSignal: environment.onStopSignal,
  };
  const { command } = parsed;
  try {
    switch (command.name) {
      case 'help':
        logger.print(USAGE);
        return EXIT.ok;
      case 'version':
        logger.print(CLIENT_VERSION);
        return EXIT.ok;
      case 'init':
        return await initCommand(command, context);
      case 'code':
        return await codeCommand(command, context);
      case 'status':
        return await statusCommand(command, context);
      case 'start':
        return await startCommand(command, context);
    }
  } catch (error) {
    logger.error(error instanceof Error ? error.message : 'An unexpected error stopped the command.');
    return EXIT.failure;
  }
}
