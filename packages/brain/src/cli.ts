#!/usr/bin/env node
/**
 * `minera-brain`: drafts a network report.
 *
 *   minera-brain report [--network mainnet|testnet] [--ask] [--out <file>]
 *
 * It prints the draft, or writes it to --out. With --ask it also asks the network for one sentence,
 * as a verified prompt that two rigs answer. It never posts anything.
 */

import { writeFileSync } from 'node:fs';
import { createApi } from '@minera-gpu/mcp/api';
import { COORDINATORS, isNetworkKey, type NetworkKey } from '@minera/shared';
import { buildReport } from './report.ts';

const USAGE = 'Usage: minera-brain report [--network mainnet|testnet] [--ask] [--out <file>]';

async function main(argv: readonly string[]): Promise<number> {
  const [command, ...rest] = argv;
  if (command !== 'report') {
    process.stderr.write(`${USAGE}\n`);
    return command === '--help' || command === undefined ? 0 : 64;
  }
  let network: NetworkKey = 'mainnet';
  let ask = false;
  let out: string | null = null;
  for (let i = 0; i < rest.length; i++) {
    const arg = rest[i];
    if (arg === '--ask') ask = true;
    else if (arg === '--network' && isNetworkKey(rest[i + 1])) network = rest[++i] as NetworkKey;
    else if (arg === '--out' && rest[i + 1]) out = rest[++i] ?? null;
    else {
      process.stderr.write(`Unknown or incomplete option: ${arg}\n${USAGE}\n`);
      return 64;
    }
  }
  const report = await buildReport({ api: createApi({ baseUrl: COORDINATORS[network].url }), ask });
  if (out) {
    writeFileSync(out, report.markdown);
    process.stderr.write(`Draft written to ${out}. Network sentence: ${report.thought.kind}.\n`);
  } else {
    process.stdout.write(report.markdown);
  }
  return 0;
}

process.exitCode = await main(process.argv.slice(2));
