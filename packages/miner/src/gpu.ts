/**
 * Finds the GPU through the driver's command-line tool. The model and memory are informational:
 * the coordinator times the rig's real throughput itself. The card's unique id keeps two rigs on
 * one card from checking each other's work.
 */

import { execFile } from 'node:child_process';
import type { GpuInfo } from '@minera/shared';

/** Runs a program and resolves its stdout, or null when it is missing, fails or times out. */
export type CommandRunner = (file: string, args: readonly string[], timeoutMs: number) => Promise<string | null>;

const DETECT_TIMEOUT_MS = 5_000;
const MAX_MODEL_LENGTH = 128;
const DRIVER_PATTERN = /^[0-9A-Za-z][0-9A-Za-z.+_-]{0,63}$/;
const NUMBER_PATTERN = /^\d+(\.\d+)?$/;
const CSV_UUID_PATTERN = /^GPU-[0-9A-Fa-f-]{8,64}$/;
const UUID_PATTERN = /^[0-9A-Za-z][0-9A-Za-z:._-]{3,127}$/;

/** The driver tools asked, in order. The executable names are fixed by the drivers. */
export const CSV_QUERY = {
  file: 'nvidia-smi',
  args: ['--query-gpu=name,memory.total,driver_version,uuid', '--format=csv,noheader,nounits'],
} as const;
export const JSON_REPORT = {
  file: 'rocm-smi',
  args: ['--showproductname', '--showmeminfo', 'vram', '--showuniqueid', '--json'],
} as const;

const runCommand: CommandRunner = (file, args, timeoutMs) =>
  new Promise((resolve) => {
    execFile(
      file,
      args,
      { timeout: timeoutMs, windowsHide: true, maxBuffer: 1024 * 1024, encoding: 'utf8' },
      (error, stdout) => resolve(error ? null : stdout),
    );
  });

function cleanModel(value: string): string | null {
  const model = value.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, MAX_MODEL_LENGTH);
  return model.length > 0 && !/^\[.*\]$/.test(model) ? model : null;
}

function gpu(model: string, vramMb: number, driver: string | undefined, uuid: string | undefined): GpuInfo {
  const info: GpuInfo = { model, vramMb };
  if (driver !== undefined && DRIVER_PATTERN.test(driver)) info.driver = driver;
  if (uuid !== undefined && UUID_PATTERN.test(uuid)) info.uuid = uuid;
  return info;
}

/**
 * Parses `name, memory.total, driver_version, uuid` lines in MiB. A name can contain commas, so
 * the other three fields are taken from the end. The first well-formed line wins.
 */
export function parseCsvQuery(stdout: string): GpuInfo | null {
  for (const line of stdout.split(/\r?\n/)) {
    const fields = line.split(',').map((field) => field.trim());
    if (fields.length < 4) continue;
    const uuid = fields.at(-1) ?? '';
    const driver = fields.at(-2);
    const memory = fields.at(-3) ?? '';
    const model = cleanModel(fields.slice(0, -3).join(', '));
    if (model === null || !NUMBER_PATTERN.test(memory)) continue;
    const vramMb = Math.round(Number(memory));
    if (vramMb <= 0) continue;
    return gpu(model, vramMb, driver, CSV_UUID_PATTERN.test(uuid) ? uuid : undefined);
  }
  return null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function findField(record: Record<string, unknown>, pattern: RegExp): string | undefined {
  for (const [key, value] of Object.entries(record)) {
    if (pattern.test(key) && (typeof value === 'string' || typeof value === 'number')) return String(value).trim();
  }
  return undefined;
}

/**
 * Parses the JSON report keyed by `card0`, `card1`, ... Field names differ between tool versions,
 * so they are matched loosely. VRAM is reported in bytes.
 */
export function parseJsonReport(stdout: string): GpuInfo | null {
  let report: unknown;
  try {
    report = JSON.parse(stdout);
  } catch {
    return null;
  }
  if (!isRecord(report)) return null;
  const system = report['system'];
  const driver = isRecord(system) ? findField(system, /^driver version$/i) : undefined;

  for (const [key, card] of Object.entries(report)) {
    if (!/^card\d+$/i.test(key) || !isRecord(card)) continue;
    const name =
      findField(card, /^marketing name$/i) ?? findField(card, /^card series$/i) ?? findField(card, /^card model$/i);
    const model = name === undefined ? null : cleanModel(name);
    const bytes = findField(card, /^vram total memory \(b\)$/i);
    if (model === null || bytes === undefined || !NUMBER_PATTERN.test(bytes)) continue;
    const vramMb = Math.round(Number(bytes) / (1024 * 1024));
    if (vramMb <= 0) continue;
    return gpu(model, vramMb, driver, findField(card, /^unique id$/i));
  }
  return null;
}

export async function detectGpu(run: CommandRunner = runCommand): Promise<GpuInfo | null> {
  const csv = await run(CSV_QUERY.file, CSV_QUERY.args, DETECT_TIMEOUT_MS);
  const fromCsv = csv === null ? null : parseCsvQuery(csv);
  if (fromCsv) return fromCsv;
  const report = await run(JSON_REPORT.file, JSON_REPORT.args, DETECT_TIMEOUT_MS);
  return report === null ? null : parseJsonReport(report);
}

export function describeGpu(info: GpuInfo): string {
  const driver = info.driver ? `, driver ${info.driver}` : '';
  return `${info.model}, ${info.vramMb} MB VRAM${driver}`;
}
