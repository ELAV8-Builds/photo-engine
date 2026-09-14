/**
 * Deterministic validation of a story plan — model output is untrusted text.
 * Everything is clamped, deduplicated and word-limited; anything essential
 * that is missing throws so the caller can retry or fall back.
 *
 * Pure functions.
 */

import { assertServer } from '../runtime';
import type { ShotRole, StoryChapter, StoryContext, StoryPacing, StoryPlan, StoryShot, StoryTemplateStyle } from '@/types/library';

assertServer();

/** Must match `TemplateStyle` in src/types/index.ts (the type check below enforces it). */
export const STORY_TEMPLATE_STYLES: readonly StoryTemplateStyle[] = [
  'cinematic', 'dynamic', 'minimal', 'retro', 'glitch', 'parallax',
  'summer', 'winter', 'party', 'electric', 'golden', 'neon',
];

export const STORY_LIMITS = {
  titleWords: 6,
  subtitleWords: 12,
  chapterTitleWords: 4,
  reasonWords: 12,
  maxReasons: 3,
  maxChapters: 8,
  minChapterItems: 2,
  moodWords: 4,
} as const;

export class InvalidStoryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidStoryError';
  }
}

const PACINGS: readonly StoryPacing[] = ['calm', 'steady', 'fast'];
const ROLES: readonly ShotRole[] = ['opener', 'beat', 'breather', 'closer', 'planet'];

export function words(value: unknown, max: number): string {
  if (typeof value !== 'string') return '';
  return value
    .replace(/["“”]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .slice(0, max)
    .join(' ')
    .replace(/[.,;:]+$/, '');
}

function asInt(v: unknown): number | undefined {
  const n = typeof v === 'string' ? Number(v) : v;
  return typeof n === 'number' && Number.isFinite(n) ? Math.round(n) : undefined;
}

export function isTemplateStyle(v: unknown): v is StoryTemplateStyle {
  return typeof v === 'string' && (STORY_TEMPLATE_STYLES as readonly string[]).includes(v);
}

/** Some models answer with a template *name* ("Cinematic Journey"); map the obvious ones. */
export function coerceTemplateStyle(v: unknown): StoryTemplateStyle | undefined {
  if (isTemplateStyle(v)) return v;
  if (typeof v !== 'string') return undefined;
  const s = v.toLowerCase();
  return STORY_TEMPLATE_STYLES.find((style) => s.includes(style));
}

/**
 * Chapters must be ordered, non-overlapping, inside [0, n), each ≥ minChapterItems
 * where possible, ≤ maxChapters. Gaps are absorbed into the preceding chapter;
 * the first chapter starts at 0 and the last ends at n − 1.
 */
export function normaliseChapters(raw: unknown, n: number): StoryChapter[] {
  if (n === 0) return [];
  const list = Array.isArray(raw) ? raw : [];
  const parsed: StoryChapter[] = [];
  for (const c of list) {
    if (!c || typeof c !== 'object') continue;
    const o = c as Record<string, unknown>;
    const start = asInt(o.startIndex ?? o.start);
    const end = asInt(o.endIndex ?? o.end);
    if (start === undefined || end === undefined) continue;
    const s = Math.max(0, Math.min(n - 1, Math.min(start, end)));
    const e = Math.max(0, Math.min(n - 1, Math.max(start, end)));
    parsed.push({ title: words(o.title, STORY_LIMITS.chapterTitleWords) || 'Chapter', startIndex: s, endIndex: e });
  }
  parsed.sort((a, b) => a.startIndex - b.startIndex);

  const out: StoryChapter[] = [];
  for (const c of parsed) {
    const prev = out[out.length - 1];
    const start = prev ? Math.max(c.startIndex, prev.endIndex + 1) : 0;
    if (start > c.endIndex) continue; // swallowed by the previous chapter
    if (prev) prev.endIndex = start - 1;
    out.push({ ...c, startIndex: start });
    if (out.length >= STORY_LIMITS.maxChapters) break;
  }
  if (out.length === 0) return [{ title: 'Highlights', startIndex: 0, endIndex: n - 1 }];
  out[0].startIndex = 0;
  out[out.length - 1].endIndex = n - 1;
  // Fill gaps: each chapter runs until the next begins.
  for (let i = 0; i < out.length - 1; i++) out[i].endIndex = out[i + 1].startIndex - 1;
  // Merge chapters that are too short into their neighbour.
  for (let i = out.length - 1; i > 0; i--) {
    if (out[i].endIndex - out[i].startIndex + 1 < STORY_LIMITS.minChapterItems) {
      out[i - 1].endIndex = out[i].endIndex;
      out.splice(i, 1);
    }
  }
  if (out.length > 1 && out[0].endIndex - out[0].startIndex + 1 < STORY_LIMITS.minChapterItems) {
    out[1].startIndex = 0;
    out.splice(0, 1);
  }
  return out;
}

export function normaliseShotList(raw: unknown, n: number, is360?: (index: number) => boolean): StoryShot[] {
  const list = Array.isArray(raw) ? raw : [];
  const byIndex = new Map<number, ShotRole>();
  for (const s of list) {
    if (!s || typeof s !== 'object') continue;
    const o = s as Record<string, unknown>;
    const idx = asInt(o.index);
    if (idx === undefined || idx < 0 || idx >= n || byIndex.has(idx)) continue;
    const role = typeof o.role === 'string' && (ROLES as readonly string[]).includes(o.role) ? (o.role as ShotRole) : 'beat';
    byIndex.set(idx, role);
  }
  // Exactly one opener and one closer; at most one planet, and only on a 360 shot.
  let opener = -1;
  let closer = -1;
  let planet = -1;
  byIndex.forEach((role, idx) => {
    if (role === 'opener') opener = opener === -1 ? idx : Math.min(opener, idx);
    if (role === 'closer') closer = closer === -1 ? idx : Math.max(closer, idx);
    if (role === 'planet' && (is360?.(idx) ?? false) && planet === -1) planet = idx;
  });
  const out: StoryShot[] = [];
  for (let i = 0; i < n; i++) {
    let role = byIndex.get(i) ?? 'beat';
    if (role === 'opener' && i !== opener) role = 'beat';
    if (role === 'closer' && i !== closer) role = 'beat';
    if (role === 'planet' && i !== planet) role = 'beat';
    out.push({ index: i, role });
  }
  if (n > 0 && opener === -1) out[0].role = 'opener';
  if (n > 1 && closer === -1) out[n - 1].role = 'closer';
  return out;
}

/** Validate a parsed model reply against the context. Throws InvalidStoryError when essentials are missing. */
export function validateStoryPlan(value: unknown, ctx: StoryContext, meta: { model?: string }): StoryPlan {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new InvalidStoryError('Story is not a JSON object');
  const o = value as Record<string, unknown>;
  const n = ctx.entries.length;

  const title = words(o.title, STORY_LIMITS.titleWords);
  if (!title) throw new InvalidStoryError('Story is missing a title');
  const templateStyle = coerceTemplateStyle(o.template ?? o.templateStyle);
  if (!templateStyle) throw new InvalidStoryError('Story names an unknown template');

  const reasonsRaw = Array.isArray(o.templateReasons) ? o.templateReasons : typeof o.templateReasons === 'string' ? [o.templateReasons] : [];
  const templateReasons = reasonsRaw.map((r) => words(r, STORY_LIMITS.reasonWords)).filter(Boolean).slice(0, STORY_LIMITS.maxReasons);

  const pacing = typeof o.pacing === 'string' && (PACINGS as readonly string[]).includes(o.pacing) ? (o.pacing as StoryPacing) : 'steady';

  return {
    version: 1,
    source: 'model',
    model: meta.model,
    createdAt: Date.now(),
    keys: ctx.entries.map((e) => e.key),
    title,
    subtitle: words(o.subtitle, STORY_LIMITS.subtitleWords),
    chapters: normaliseChapters(o.chapters, n),
    templateStyle,
    templateReasons,
    pacing,
    musicMood: words(o.musicMood ?? o.music_mood, STORY_LIMITS.moodWords),
    shotList: normaliseShotList(o.shotList ?? o.shot_list, n, (i) => !!ctx.entries[i]?.is360),
  };
}
