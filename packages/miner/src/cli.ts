#!/usr/bin/env node
import { main, processEnvironment } from './main.ts';

process.exitCode = await main(process.argv.slice(2), processEnvironment());
