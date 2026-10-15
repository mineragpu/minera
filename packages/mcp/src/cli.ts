#!/usr/bin/env node
/**
 * `minera-mcp`: the read-only Minera MCP server on stdio. One JSON-RPC message per line in and
 * out; anything for people goes to stderr, so stdout carries only protocol messages.
 *
 *   minera-mcp [--network mainnet|testnet] [--coordinator <https url>]
 */

import { createInterface } from 'node:readline';
import { createApi } from './api.ts';
import { parseArgs, VERSION } from './args.ts';
import { createServer } from './server.ts';

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  if ('message' in options) {
    (options.code === 0 ? process.stdout : process.stderr).write(`${options.message}\n`);
    process.exitCode = options.code;
    return;
  }
  const server = createServer({ api: createApi({ baseUrl: options.coordinator }), network: options.network, version: VERSION });
  process.stderr.write(`minera-mcp ${VERSION}: ${options.network} through ${options.coordinator}\n`);
  const lines = createInterface({ input: process.stdin, crlfDelay: Infinity });
  for await (const line of lines) {
    if (line.trim() === '') continue;
    let message: unknown;
    try {
      message = JSON.parse(line);
    } catch {
      process.stdout.write(`${JSON.stringify({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } })}\n`);
      continue;
    }
    const answer = await server.handle(message);
    if (answer) process.stdout.write(`${JSON.stringify(answer)}\n`);
  }
}

await main();
