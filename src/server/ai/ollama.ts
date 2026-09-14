/**
 * Ollama client + `OllamaProvider`.
 *
 * Call shape proven in Phase 1 on qwen3.5:9b: /api/chat, non-streaming,
 * `format: "json"`, `think: false` (otherwise the whole token budget goes to
 * thinking and the content comes back empty), low temperature, `keep_alive`
 * of five minutes so the model unloads itself when curation goes quiet.
 *
 * One inference at a time, process-wide (shared `withInferenceLock`): the job
 * queue already serialises the `model` lane, and the lock covers ad-hoc calls
 * from API routes so two requests never make Ollama juggle contexts.
 */

import { assertServer } from '../runtime';
import { createLogger } from '../log';
import {
  FRAME_GRADE_PROMPT,
  FRAME_GRADE_RETRY_SUFFIX,
  InvalidModelOutputError,
  parseFrameGrade,
  ProviderUnavailableError,
  withInferenceLock,
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

/**
 * Phase 9 (§3.3): grading is pinned to `temperature: 0` plus this seed so a
 * forced re-analysis reproduces run-to-run. Measured on qwen3.5:9b / Ollama
 * 0.33.3: unpinned (temp 0.1) varied per call on the same frame — including a
 * quality "dark" ↔ "ok" flip on dim frames, the exact mechanism behind the
 * 0.42 ↔ 0.6 fused-score drift Phase 8 saw — while pinned calls were
 * byte-identical regardless of request order. Story writing and ad-hoc
 * descriptions stay unpinned (temp 0.1) so "Regenerate" keeps its variety.
 */
const GRADE_SEED = 42;

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

export class OllamaUnavailableError extends ProviderUnavailableError {
  constructor(message: string) {
    super(message);
    this.name = 'OllamaUnavailableError';
  }
}

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export interface OllamaProviderOptions {
  model: string;
  baseUrl?: string;
  timeoutMs?: number;
  /**
   * Phase 7: CPU threads Ollama may use for this provider's requests, from the
   * active ResourceBudget (quiet 2 / balanced 4 / fast 8). Sent per request as
   * `options.num_thread` so the model lane honours the performance profile the
   * way the ffmpeg lane already does. Undefined = Ollama's default.
   */
  threads?: number;
}

export class OllamaProvider implements VisionProvider {
  readonly name = 'ollama';
  readonly model: string;
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly threads?: number;

  constructor(opts: OllamaProviderOptions) {
    this.model = opts.model;
    this.baseUrl = opts.baseUrl ?? OLLAMA_BASE_URL;
    this.timeoutMs = opts.timeoutMs ?? REQUEST_TIMEOUT_MS;
    this.threads = opts.threads;
  }

  async gradeFrame(jpeg: Buffer, ctx: InferenceContext = {}): Promise<FrameGrade> {
    const image = jpeg.toString('base64');
    const first = await this.chat(FRAME_GRADE_PROMPT, { image, json: true, numPredict: 160, deterministic: true, signal: ctx.signal });
    try {
      return parseFrameGrade(safeJson(first), first);
    } catch (err) {
      if (!(err instanceof InvalidModelOutputError)) throw err;
      log.debug('retrying invalid grade', { label: ctx.label, raw: first.slice(0, 200) });
    }
    // The retry prompt differs (suffix), so pinning cannot replay the same invalid answer.
    const second = await this.chat(FRAME_GRADE_PROMPT + FRAME_GRADE_RETRY_SUFFIX, { image, json: true, numPredict: 160, deterministic: true, signal: ctx.signal });
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
    opts: { image?: string; json: boolean; numPredict: number; deterministic?: boolean; signal?: AbortSignal },
  ): Promise<string> {
    const body = {
      model: this.model,
      stream: false,
      format: opts.json ? 'json' : undefined,
      think: false,
      keep_alive: KEEP_ALIVE,
      options: {
        ...(opts.deterministic ? { temperature: 0, seed: GRADE_SEED } : { temperature: 0.1 }),
        num_predict: opts.numPredict,
        ...(this.threads !== undefined ? { num_thread: this.threads } : {}),
      },
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
export function createOllamaProvider(model: string, threads?: number): OllamaProvider {
  return new OllamaProvider({ model, threads });
}
