/**
 * Checks every coordinator reply against the protocol before the node acts on it. A job that
 * fails the checks is never run.
 */

import type {
  Address,
  HeartbeatResponse,
  HelloResponse,
  JobAssignment,
  JobKind,
  JobResultResponse,
} from '@minera/shared';
import { isAddress } from 'viem';
import { sanitize } from './logger.ts';

export class ProtocolError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ProtocolError';
  }
}

export interface ParsedHeartbeat extends HeartbeatResponse {
  /** Why each job that failed the checks was dropped. */
  rejected: string[];
}

const JOB_KINDS: readonly JobKind[] = ['chat', 'benchmark', 'challenge'];
const ROLES = ['system', 'user', 'assistant'] as const;
const MAX_ID_LENGTH = 200;
const MAX_MESSAGES = 256;
const MAX_PROMPT_CHARACTERS = 1_000_000;
const MAX_TOKENS = 131_072;
const MAX_DEADLINE_SECONDS = 86_400;
const MAX_JOBS_PER_HEARTBEAT = 64;
const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function record(value: unknown, what: string): Record<string, unknown> {
  if (!isRecord(value)) throw new ProtocolError(`${what} is not an object.`);
  return value;
}

function text(value: unknown, what: string, maxLength: number): string {
  if (typeof value !== 'string' || value.length === 0 || value.length > maxLength || CONTROL_CHARACTERS.test(value)) {
    throw new ProtocolError(`${what} is missing or malformed.`);
  }
  return value;
}

function address(value: unknown, what: string): Address {
  if (typeof value !== 'string' || !isAddress(value, { strict: false })) {
    throw new ProtocolError(`${what} is not an address.`);
  }
  return value;
}

function integer(value: unknown, what: string, min: number, max: number): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < min || value > max) {
    throw new ProtocolError(`${what} must be a whole number from ${min} to ${max}.`);
  }
  return value;
}

function seconds(value: unknown, what: string, max: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0 || value > max) {
    throw new ProtocolError(`${what} must be a number of seconds above 0 and at most ${max}.`);
  }
  return value;
}

export function parseJobAssignment(value: unknown): JobAssignment {
  const job = record(value, 'The job');
  const id = text(job['id'], 'The job id', MAX_ID_LENGTH);
  const kind = job['kind'];
  if (!JOB_KINDS.includes(kind as JobKind)) throw new ProtocolError(`Job ${id} has an unknown kind.`);
  const model = text(job['model'], `The model of job ${id}`, MAX_ID_LENGTH);

  const params = record(job['params'], `The params of job ${id}`);
  if (params['temperature'] !== 0) throw new ProtocolError(`Job ${id} must run at temperature 0.`);
  const seed = integer(params['seed'], `The seed of job ${id}`, Number.MIN_SAFE_INTEGER, Number.MAX_SAFE_INTEGER);
  const maxTokens = integer(params['maxTokens'], `The token limit of job ${id}`, 1, MAX_TOKENS);

  const rawMessages = job['messages'];
  if (!Array.isArray(rawMessages) || rawMessages.length === 0 || rawMessages.length > MAX_MESSAGES) {
    throw new ProtocolError(`Job ${id} must carry between 1 and ${MAX_MESSAGES} messages.`);
  }
  let characters = 0;
  const messages = rawMessages.map((raw: unknown) => {
    const message = record(raw, `A message of job ${id}`);
    const role = ROLES.find((candidate) => candidate === message['role']);
    const content = message['content'];
    if (role === undefined || typeof content !== 'string') {
      throw new ProtocolError(`Job ${id} has a message without a valid role and content.`);
    }
    characters += content.length;
    return { role, content };
  });
  if (characters > MAX_PROMPT_CHARACTERS) throw new ProtocolError(`Job ${id} has too long a prompt.`);

  const deadlineSeconds = seconds(job['deadlineSeconds'], `The deadline of job ${id}`, MAX_DEADLINE_SECONDS);
  return { id, kind: kind as JobKind, model, params: { temperature: 0, seed, maxTokens }, messages, deadlineSeconds };
}

export function parseHelloResponse(value: unknown): HelloResponse {
  const hello = record(value, 'The hello reply');
  const rig = record(hello['rig'], 'The rig in the hello reply');
  const benchmark = hello['benchmark'];
  return {
    rig: {
      nodeKey: address(rig['nodeKey'], 'The rig node key'),
      operator: address(rig['operator'], 'The rig operator'),
      name: sanitize(text(rig['name'], 'The rig name', MAX_ID_LENGTH)),
      pair: address(rig['pair'], 'The rig pair'),
    },
    heartbeatSeconds: seconds(hello['heartbeatSeconds'], 'The heartbeat interval', MAX_DEADLINE_SECONDS),
    benchmark: benchmark === null || benchmark === undefined ? null : parseJobAssignment(benchmark),
  };
}

export function parseHeartbeatResponse(value: unknown): ParsedHeartbeat {
  const heartbeat = record(value, 'The heartbeat reply');
  const rawJobs = heartbeat['jobs'] ?? [];
  if (!Array.isArray(rawJobs)) throw new ProtocolError('The jobs in the heartbeat reply are not a list.');
  const jobs: JobAssignment[] = [];
  const rejected: string[] = [];
  for (const raw of rawJobs.slice(0, MAX_JOBS_PER_HEARTBEAT)) {
    try {
      jobs.push(parseJobAssignment(raw));
    } catch (error) {
      if (!(error instanceof ProtocolError)) throw error;
      rejected.push(error.message);
    }
  }
  if (rawJobs.length > MAX_JOBS_PER_HEARTBEAT) {
    rejected.push(`${rawJobs.length - MAX_JOBS_PER_HEARTBEAT} jobs beyond the first ${MAX_JOBS_PER_HEARTBEAT}.`);
  }
  return {
    heartbeatSeconds: seconds(heartbeat['heartbeatSeconds'], 'The heartbeat interval', MAX_DEADLINE_SECONDS),
    jobs,
    rejected,
  };
}

export function parseJobResultResponse(value: unknown): JobResultResponse {
  const result = record(value, 'The result reply');
  if (typeof result['accepted'] !== 'boolean') throw new ProtocolError('The result reply has no verdict.');
  const reason = result['reason'];
  return typeof reason === 'string' && reason.length > 0
    ? { accepted: result['accepted'], reason: sanitize(reason).slice(0, 200) }
    : { accepted: result['accepted'] };
}
