/**
 * `GeminiProvider` — the opt-in cloud backend behind the same `VisionProvider`
 * contract as Ollama. Plain `fetch` against the Generative Language REST API
 * (`models/<id>:generateContent`, `x-goog-api-key`), verified against the
 * September 2026 docs:
 *   - inline JPEG parts with per-part `media_resolution: MEDIA_RESOLUTION_LOW`
 *     (Gemini 3 feature; keeps 512 px frames cheap),
 *   - `generationConfig.responseMimeType: application/json` for JSON mode,
 *   - `thinkingConfig.thinkingLevel: MINIMAL` — grading needs no deliberation,
 *   - no temperature override (Google advises defaults for 3.x models).
 *
 * The key arrives per call and is held only on this object in memory. Calls
 * are serialised through the shared inference lock and spaced ≥ 250 ms apart
 * so a whole-card run stays inside free-tier request rates.
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

const log = createLogger('gemini');

export const GEMINI_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta';
export const DEFAULT_GEMINI_MODEL = 'gemini-3.5-flash-lite';
const REQUEST_TIMEOUT_MS = 60_000;
const MIN_SPACING_MS = 250;
const RATE_LIMIT_BACKOFF_MS = 2_000;

/** Keys are opaque tokens; this only guards against pasting something that is obviously not one. */
export function isPlausibleGeminiKey(value: unknown): value is string {
  return typeof value === 'string' && /^[A-Za-z0-9_\-]{20,200}$/.test(value);
}

export function isGeminiModelId(value: unknown): value is string {
  return typeof value === 'string' && /^[a-z0-9][a-z0-9.\-]{2,60}$/.test(value);
}

interface GeminiResponse {
  candidates?: Array<{
    content?: { parts?: Array<{ text?: string; thought?: boolean }> };
    finishReason?: string;
  }>;
  promptFeedback?: { blockReason?: string };
  error?: { code?: number; message?: string; status?: string };
}

export interface GeminiProviderOptions {
  key: string;
  model?: string;
  baseUrl?: string;
  timeoutMs?: number;
}

let lastCallAt = 0;

export class GeminiProvider implements VisionProvider {
  readonly name = 'gemini';
  readonly model: string;
  private readonly key: string;
  private readonly baseUrl: string;
  private readonly timeoutMs: number;

  constructor(opts: GeminiProviderOptions) {
    this.key = opts.key;
    this.model = opts.model ?? DEFAULT_GEMINI_MODEL;
    this.baseUrl = opts.baseUrl ?? GEMINI_BASE_URL;
    this.timeoutMs = opts.timeoutMs ?? REQUEST_TIMEOUT_MS;
  }

  async gradeFrame(jpeg: Buffer, ctx: InferenceContext = {}): Promise<FrameGrade> {
    const image = jpeg.toString('base64');
    const first = await this.generate(FRAME_GRADE_PROMPT, { image, json: true, maxTokens: 200, signal: ctx.signal });
    try {
      return parseFrameGrade(safeJson(first), first);
    } catch (err) {
      if (!(err instanceof InvalidModelOutputError)) throw err;
      log.debug('retrying invalid grade', { label: ctx.label });
    }
    const second = await this.generate(FRAME_GRADE_PROMPT + FRAME_GRADE_RETRY_SUFFIX, { image, json: true, maxTokens: 200, signal: ctx.signal });
    return parseFrameGrade(safeJson(second), second);
  }

  async describeImage(jpeg: Buffer, ctx: InferenceContext = {}): Promise<string> {
    const text = await this.generate('Describe this photo in one plain sentence of at most 20 words. No preamble.', {
      image: jpeg.toString('base64'),
      json: false,
      maxTokens: 80,
      signal: ctx.signal,
    });
    return text.replace(/\s+/g, ' ').trim();
  }

  async writeJson(prompt: string, ctx: InferenceContext = {}): Promise<unknown> {
    const text = await this.generate(prompt, { json: true, maxTokens: 2000, signal: ctx.signal });
    const parsed = safeJson(text);
    if (parsed === undefined) throw new InvalidModelOutputError('Model did not return JSON', text);
    return parsed;
  }

  /** Cheapest possible round-trip to prove the key and model work. */
  async ping(signal?: AbortSignal): Promise<void> {
    await this.generate('Reply with the single word ok.', { json: false, maxTokens: 5, signal });
  }

  private async generate(
    prompt: string,
    opts: { image?: string; json: boolean; maxTokens: number; signal?: AbortSignal },
  ): Promise<string> {
    const parts: unknown[] = [{ text: prompt }];
    if (opts.image) {
      parts.push({ inline_data: { mime_type: 'image/jpeg', data: opts.image }, media_resolution: { level: 'MEDIA_RESOLUTION_LOW' } });
    }
    const body = {
      contents: [{ role: 'user', parts }],
      generationConfig: {
        ...(opts.json ? { responseMimeType: 'application/json' } : {}),
        maxOutputTokens: opts.maxTokens,
        thinkingConfig: { thinkingLevel: 'MINIMAL' },
      },
    };

    return withInferenceLock(async () => {
      if (opts.signal?.aborted) throw new Error('Inference cancelled');
      await this.space();
      let res = await this.post(body, opts.signal);
      if (res.status === 429) {
        log.warn('rate limited; backing off once', { ms: RATE_LIMIT_BACKOFF_MS });
        await sleep(RATE_LIMIT_BACKOFF_MS, opts.signal);
        res = await this.post(body, opts.signal);
      }
      const data = (await res.json().catch(() => ({}))) as GeminiResponse;
      if (!res.ok) throw this.mapError(res.status, data);

      const blocked = data.promptFeedback?.blockReason;
      if (blocked) throw new InvalidModelOutputError(`Gemini blocked the prompt (${blocked})`, '');
      const text = (data.candidates?.[0]?.content?.parts ?? [])
        .filter((p) => !p.thought && typeof p.text === 'string')
        .map((p) => p.text)
        .join('');
      return text;
    });
  }

  private async post(body: unknown, signal?: AbortSignal): Promise<Response> {
    const signals = [AbortSignal.timeout(this.timeoutMs), ...(signal ? [signal] : [])];
    try {
      return await fetch(`${this.baseUrl}/models/${encodeURIComponent(this.model)}:generateContent`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-goog-api-key': this.key },
        body: JSON.stringify(body),
        signal: AbortSignal.any(signals),
      });
    } catch (err) {
      if (signal?.aborted) throw new Error('Inference cancelled');
      throw new ProviderUnavailableError(`Gemini is not reachable: ${(err as Error).message}`);
    } finally {
      lastCallAt = Date.now();
    }
  }

  private mapError(status: number, data: GeminiResponse): Error {
    const detail = data.error?.message ? `: ${data.error.message.slice(0, 160)}` : '';
    if (status === 400 && /API key|API_KEY/i.test(data.error?.message ?? '')) return new ProviderUnavailableError('Gemini rejected the API key — check it in Settings');
    if (status === 401 || status === 403) return new ProviderUnavailableError('Gemini rejected the API key — check it in Settings');
    if (status === 404) return new ProviderUnavailableError(`Gemini model "${this.model}" was not found${detail}`);
    if (status === 429) return new ProviderUnavailableError('Gemini rate limit reached — the item stays pending; try again shortly');
    if (status >= 500) return new ProviderUnavailableError(`Gemini returned HTTP ${status}${detail}`);
    return new Error(`Gemini returned HTTP ${status}${detail}`);
  }

  private async space(): Promise<void> {
    const wait = lastCallAt + MIN_SPACING_MS - Date.now();
    if (wait > 0) await sleep(wait);
  }
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(resolve, ms);
    signal?.addEventListener('abort', () => {
      clearTimeout(t);
      reject(new Error('Inference cancelled'));
    }, { once: true });
  });
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    const m = /\{[\s\S]*\}/.exec(text);
    if (!m) return undefined;
    try {
      return JSON.parse(m[0]);
    } catch {
      return undefined;
    }
  }
}
