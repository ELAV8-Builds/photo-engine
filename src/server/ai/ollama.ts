/**
 * Ollama client + `OllamaProvider`.
 *
 * Call shape proven in Phase 1 on qwen3.5:9b: /api/chat, non-streaming,
 * `format: "json"`, `think: false` (otherwise the whole token budget goes to
 * thinking and the content comes back empty), low temperature, `keep_alive`
 * of five minutes so the model unloads itself when curation goes quiet.
 *
 * One inference at a time, process-wide: the job queue already serialises
 * the `model` lane, and the lock here covers ad-hoc calls from API routes so
 * two requests never make Ollama juggle contexts.
 */

import { assertServer, globalSingleton } from '../runtime';
import { createLogger } from '../log';
import {
  FRAME_GRADE_PROMPT,
  FRAME_GRADE_RETRY_SUFFIX,
  InvalidModelOutputError,
  parseFrameGrade,
  type InferenceContext,
  type VisionProvider,
} from './provider';
import type { FrameGrade } from '@/types/library';

assertServer();

const log = createLogger('ollama');

export const OLLAMA_BASE_URL = 'http://localhost:11434';
const REQUEST_TIMEOUT_MS = 120_000;
const HEALTH_TIMEOUT_MS = 3_000;
const KEEP_ALIVE = '5m';

export interface OllamaHealth {
  running: boolean;
  version?: string;
  models: string[];
}

interface ChatResponse {
  message?: { role: string; content: string };
  done?: boolean;
  eval_duration?: number;
  prompt_eval_duration?: number;
  total_duration?: number;
}

/** GET /api/version + /api/tags. Never throws; an unreachable server is a normal state. */
export async function ollamaHealth(): Promise<OllamaHealth> {
  try {
    const [v, t] = await Promise.all([
      fetch(`${OLLAMA_BASE_URL}/api/version`, { signal: AbortSignal.timeout(HEALTH_TIMEOUT_MS) }),
      fetch(`${OLLAMA_BASE_URL}/api/tags`, { signal: AbortSignal.timeout(HEALTH_TIMEOUT_MS) }),
    ]);
    if (!v.ok || !t.ok) return { running: false, models: [] };
    const version = ((await v.json()) as { version?: string }).version;
    const tags = (await t.json()) as { models?: Array<{ name?: string; model?: string }> };
    const models = (tags.models ?? []).map((m) => m.name ?? m.model ?? '').filter(Boolean);
    return { running: true, version, models };
  } catch {
    return { running: false, models: [] };
  }
}

/** True when `model` (with or without an explicit tag) is in the pulled list. */
export function hasModel(models: string[], model: string): boolean {
  const want = model.includes(':') ? model : `${model}:latest`;
  return models.some((m) => m === want || m === model);
}

export class OllamaUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'OllamaUnavailableError';
  }
}

// ---------------------------------------------------------------------------
// Inference lock
// ---------------------------------------------------------------------------

const lockState = globalSingleton('__photoforge_ollama_lock', () => ({ busy: false, waiters: [] as Array<() => void> }));

async function withInferenceLock<T>(fn: () => Promise<T>): Promise<T> {
  if (lockState.busy) await new Promise<void>((resolve) => lockState.waiters.push(resolve));
  lockState.busy = true;
  try {
    return await fn();
  } finally {
    const next = lockState.waiters.shift();
    if (next) next();
    else lockState.busy = false;
  }
}

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export interface OllamaProviderOptions {
  model: string;
  baseUrl?: string;
  timeoutMs?: number;
}

export class OllamaProvider implements VisionProvider {
  readonly name = 'ollama';
  readonly model: string;
  private readonly baseUrl: string;
  private readonly timeoutMs: number;

  constructor(opts: OllamaProviderOptions) {
    this.model = opts.model;
    this.baseUrl = opts.baseUrl ?? OLLAMA_BASE_URL;
    this.timeoutMs = opts.timeoutMs ?? REQUEST_TIMEOUT_MS;
  }

  async gradeFrame(jpeg: Buffer, ctx: InferenceContext = {}): Promise<FrameGrade> {
    const image = jpeg.toString('base64');
    const first = await this.chat(FRAME_GRADE_PROMPT, { image, json: true, numPredict: 160, signal: ctx.signal });
    try {
      return parseFrameGrade(safeJson(first), first);
    } catch (err) {
      if (!(err instanceof InvalidModelOutputError)) throw err;
      log.debug('retrying invalid grade', { label: ctx.label, raw: first.slice(0, 200) });
    }
    const second = await this.chat(FRAME_GRADE_PROMPT + FRAME_GRADE_RETRY_SUFFIX, { image, json: true, numPredict: 160, signal: ctx.signal });
    return parseFrameGrade(safeJson(second), second);
  }

  async describeImage(jpeg: Buffer, ctx: InferenceContext = {}): Promise<string> {
    const text = await this.chat('Describe this photo in one plain sentence of at most 20 words. No preamble.', {
      image: jpeg.toString('base64'),
      json: false,
      numPredict: 60,
      signal: ctx.signal,
    });
    return text.replace(/\s+/g, ' ').trim();
  }

  async writeJson(prompt: string, ctx: InferenceContext = {}): Promise<unknown> {
    const text = await this.chat(prompt, { json: true, numPredict: 1200, signal: ctx.signal });
    const parsed = safeJson(text);
    if (parsed === undefined) throw new InvalidModelOutputError('Model did not return JSON', text);
    return parsed;
  }

  private async chat(
    content: string,
    opts: { image?: string; json: boolean; numPredict: number; signal?: AbortSignal },
  ): Promise<string> {
    const body = {
      model: this.model,
      stream: false,
      format: opts.json ? 'json' : undefined,
      think: false,
      keep_alive: KEEP_ALIVE,
      options: { temperature: 0.1, num_predict: opts.numPredict },
      messages: [{ role: 'user', content, ...(opts.image ? { images: [opts.image] } : {}) }],
    };

    return withInferenceLock(async () => {
      if (opts.signal?.aborted) throw new Error('Inference cancelled');
      const signals = [AbortSignal.timeout(this.timeoutMs), ...(opts.signal ? [opts.signal] : [])];
      const signal = AbortSignal.any(signals);
      let res: Response;
      try {
        res = await fetch(`${this.baseUrl}/api/chat`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(body),
          signal,
        });
      } catch (err) {
        if (opts.signal?.aborted) throw new Error('Inference cancelled');
        throw new OllamaUnavailableError(`Ollama is not reachable at ${this.baseUrl}: ${(err as Error).message}`);
      }
      if (res.status === 404) throw new OllamaUnavailableError(`Model "${this.model}" is not pulled in Ollama (ollama pull ${this.model})`);
      if (!res.ok) throw new OllamaUnavailableError(`Ollama returned HTTP ${res.status}`);
      const data = (await res.json()) as ChatResponse;
      return data.message?.content ?? '';
    });
  }
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    // Some replies wrap JSON in prose or code fences; salvage the first object.
    const m = /\{[\s\S]*\}/.exec(text);
    if (!m) return undefined;
    try {
      return JSON.parse(m[0]);
    } catch {
      return undefined;
    }
  }
}

/** Provider for the configured vision model. Cheap to construct; holds no connection. */
export function createOllamaProvider(model: string): OllamaProvider {
  return new OllamaProvider({ model });
}
