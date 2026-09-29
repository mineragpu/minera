/**
 * The local model runtime: any server that speaks the /api/chat interface, by default on port
 * 11434 of this machine. Prompts go to it and nowhere else on the machine.
 */

import type { JobAssignment, RuntimeInfo } from '@dayagpu/shared';
import { sanitize } from './logger.ts';
import { endpoint } from './url.ts';

export const DEFAULT_RUNTIME_URL = 'http://127.0.0.1:11434';

/** The interface name reported to the coordinator. It names the API, not a product. */
export const RUNTIME_INTERFACE = 'api-chat';

const DETECT_TIMEOUT_MS = 3_000;
const MAX_MODELS = 256;
const MAX_NAME_LENGTH = 200;

export interface ChatRequest {
  model: string;
  messages: JobAssignment['messages'];
  seed: number;
  maxTokens: number;
}

export interface ChatReply {
  output: string;
  promptTokens: number;
  completionTokens: number;
  durationMs: number;
}

export class RuntimeError extends Error {
  readonly status: number | null;

  constructor(message: string, status: number | null) {
    super(message);
    this.name = 'RuntimeError';
    this.status = status;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function cleanName(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const name = sanitize(value).trim();
  return name.length > 0 && name.length <= MAX_NAME_LENGTH ? name : null;
}

function count(value: unknown): number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : 0;
}

/** Resolves the parsed JSON body, or undefined when the server is unreachable or answers badly. */
async function getJson(url: URL): Promise<unknown> {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(DETECT_TIMEOUT_MS) });
    if (!response.ok) return undefined;
    return (await response.json()) as unknown;
  } catch {
    return undefined;
  }
}

export function modelNames(tags: unknown): string[] {
  const entries = isRecord(tags) && Array.isArray(tags['models']) ? tags['models'] : [];
  const names = new Set<string>();
  for (const entry of entries) {
    const name = isRecord(entry) ? cleanName(entry['name'] ?? entry['model']) : null;
    if (name !== null) names.add(name);
    if (names.size >= MAX_MODELS) break;
  }
  return [...names];
}

/** Returns null when nothing compatible answers at `baseUrl`. */
export async function detectRuntime(baseUrl: string): Promise<RuntimeInfo | null> {
  const about = await getJson(endpoint(baseUrl, '/api/version'));
  if (!isRecord(about)) return null;
  const models = modelNames(await getJson(endpoint(baseUrl, '/api/tags')));
  const version = cleanName(about['version']);
  return version === null ? { runtime: RUNTIME_INTERFACE, models } : { runtime: RUNTIME_INTERFACE, version, models };
}

async function refusal(response: Response): Promise<string> {
  let detail = '';
  try {
    const body: unknown = await response.json();
    if (isRecord(body) && typeof body['error'] === 'string') detail = `: ${sanitize(body['error']).slice(0, 200)}`;
  } catch {
    detail = '';
  }
  return `The model runtime refused the request (HTTP ${response.status}${detail}).`;
}

/** Runs one deterministic, non-streaming chat completion. */
export async function chat(baseUrl: string, request: ChatRequest, signal: AbortSignal): Promise<ChatReply> {
  const started = performance.now();
  const body = {
    model: request.model,
    messages: request.messages,
    stream: false,
    options: { temperature: 0, seed: request.seed, num_predict: request.maxTokens },
  };
  let response: Response;
  try {
    response = await fetch(endpoint(baseUrl, '/api/chat'), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal,
    });
  } catch (error) {
    if (signal.aborted) throw error;
    throw new RuntimeError(`Could not reach the model runtime at ${baseUrl}.`, null);
  }
  if (!response.ok) throw new RuntimeError(await refusal(response), response.status);

  let reply: unknown;
  try {
    reply = await response.json();
  } catch (error) {
    if (signal.aborted) throw error;
    throw new RuntimeError('The model runtime sent a reply that is not JSON.', response.status);
  }
  const message = isRecord(reply) ? reply['message'] : undefined;
  if (!isRecord(reply) || !isRecord(message) || typeof message['content'] !== 'string') {
    throw new RuntimeError('The model runtime sent a reply without a message.', response.status);
  }
  const totalNs = count(reply['total_duration']);
  return {
    output: message['content'],
    promptTokens: count(reply['prompt_eval_count']),
    completionTokens: count(reply['eval_count']),
    durationMs: totalNs > 0 ? Math.round(totalNs / 1_000_000) : Math.round(performance.now() - started),
  };
}
