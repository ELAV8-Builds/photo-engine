/**
 * Vision-model provider boundary.
 *
 * Everything that talks to a model implements `VisionProvider`; everything
 * that needs a model depends only on this interface. Phase 2 ships
 * `OllamaProvider` (local, default). Phase 4 adds `GeminiProvider` behind the
 * same contract, so the curation pipeline never learns provider details.
 *
 * Also home to the frame-grade schema validation: model output is untrusted
 * text and is normalised here before anything downstream sees it.
 */

import { assertServer } from '../runtime';
import type { FrameGrade, FrameQuality } from '@/types/library';

assertServer();

export interface InferenceContext {
  signal?: AbortSignal;
  /** Free-form hint for logging ("clip 004 @ 58s"). Never sent to the model. */
  label?: string;
}

export interface VisionProvider {
  readonly name: string;
  readonly model: string;
  /** Grade one JPEG (≤ ~512 px) against the montage rubric. */
  gradeFrame(jpeg: Buffer, ctx?: InferenceContext): Promise<FrameGrade>;
  /** One-sentence description of an image (Phase 3 chapters / titles). */
  describeImage(jpeg: Buffer, ctx?: InferenceContext): Promise<string>;
  /** Text-only structured output; the caller validates the shape. */
  writeJson(prompt: string, ctx?: InferenceContext): Promise<unknown>;
}

/**
 * Prompt validated on real X5 footage. The anchored scale matters: without it
 * qwen3.5:9b returns 5 for nearly every frame, which cannot rank anything.
 */
export const FRAME_GRADE_PROMPT = [
  'You are a ruthless video editor picking 5-second moments for a fast travel montage.',
  'One frame from a personal travel video. Return ONLY JSON:',
  '{"interest": 0-10, "quality": "ok"|"dark"|"blur"|"bright"|"blocked", "people": true|false, "faces": true|false, "scene": "3-6 words", "caption": "max 10 words"}.',
  'interest scale, use the whole range: 1-2 = nothing happening, ground/sky/wall, transitional; 3-4 = ordinary, would cut;',
  '5-6 = decent scenery or people, keeper if needed; 7-8 = strong: striking landmark, clear expressive faces, action, great light;',
  '9-10 = the single best shot of the trip. faces = a recognisable face looking near the camera.',
  'quality = blocked if a hand/body covers most of the frame.',
].join(' ');

export const FRAME_GRADE_RETRY_SUFFIX =
  ' Your previous answer was not valid JSON with exactly those six keys. Respond with the JSON object only, no prose.';

const QUALITIES: readonly FrameQuality[] = ['ok', 'dark', 'blur', 'bright', 'blocked'];

export class InvalidModelOutputError extends Error {
  constructor(message: string, public readonly raw: string) {
    super(message);
    this.name = 'InvalidModelOutputError';
  }
}

function clampInt(v: unknown, lo: number, hi: number): number | undefined {
  const n = typeof v === 'string' ? Number(v) : v;
  if (typeof n !== 'number' || !Number.isFinite(n)) return undefined;
  return Math.max(lo, Math.min(hi, Math.round(n)));
}

function asBool(v: unknown): boolean | undefined {
  if (typeof v === 'boolean') return v;
  if (v === 'true' || v === 'yes') return true;
  if (v === 'false' || v === 'no') return false;
  return undefined;
}

function words(v: unknown, max: number): string {
  if (typeof v !== 'string') return '';
  return v.replace(/\s+/g, ' ').trim().split(' ').slice(0, max).join(' ').replace(/[.]+$/, '');
}

/**
 * Normalise a parsed model reply into a FrameGrade, or throw if the essential
 * fields are missing. Tolerates the usual small-model slips (numbers as
 * strings, booleans as words, extra keys, trailing periods).
 */
export function parseFrameGrade(value: unknown, raw = ''): FrameGrade {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new InvalidModelOutputError('Grade is not a JSON object', raw);
  const o = value as Record<string, unknown>;
  const interest = clampInt(o.interest, 0, 10);
  if (interest === undefined) throw new InvalidModelOutputError('Grade is missing "interest"', raw);
  const qualityRaw = typeof o.quality === 'string' ? o.quality.toLowerCase().trim() : '';
  const quality = (QUALITIES as readonly string[]).includes(qualityRaw) ? (qualityRaw as FrameQuality) : 'ok';
  const faces = asBool(o.faces) ?? false;
  const people = asBool(o.people) ?? faces;
  return {
    interest,
    quality,
    people: people || faces,
    faces,
    scene: words(o.scene, 6),
    caption: words(o.caption, 10),
  };
}
