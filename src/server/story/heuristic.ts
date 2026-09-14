/**
 * Heuristic story plan — what the app uses when the model is unavailable or
 * its answer fails validation. Deterministic, explainable, good enough that a
 * montage never depends on Ollama being up.
 *
 * Pure functions.
 */

import { assertServer } from '../runtime';
import { STORY_LIMITS, normaliseChapters } from './validate';
import type { StoryChapter, StoryContext, StoryContextEntry, StoryPacing, StoryPlan, StoryShot, StoryTemplateStyle } from '@/types/library';

assertServer();

/** A new chapter starts after this much silence between shots. */
export const CHAPTER_GAP_MS = 45 * 60_000;

const STOP = new Set([
  'a', 'an', 'the', 'of', 'in', 'on', 'at', 'with', 'and', 'to', 'from', 'under', 'through', 'over', 'into', 'by', 'for',
  'near', 'inside', 'outside', 'people', 'person', 'man', 'woman', 'men', 'women', 'girl', 'boy', 'tourists', 'crowd', 'walking',
  'standing', 'sitting', 'stands', 'walks', 'looking', 'holding', 'his', 'her', 'their', 'its',
  // quality / framing adjectives the grader uses — never a place or subject
  'crowded', 'busy', 'blurry', 'blurred', 'dark', 'dim', 'dimly', 'bright', 'sunny', 'close', 'closeup', 'view', 'views', 'scene',
  'shot', 'interior', 'indoors', 'outdoors', 'background', 'foreground', 'large', 'small', 'many', 'some', 'several', 'with', 'under',
]);

function topWords(entries: StoryContextEntry[], max: number): string[] {
  const counts = new Map<string, number>();
  for (const e of entries) {
    const seen = new Set<string>();
    for (const t of [e.scene, e.caption]) {
      if (!t) continue;
      for (const w of t.toLowerCase().split(/[^a-z]+/)) {
        if (w.length < 4 || STOP.has(w) || seen.has(w)) continue;
        seen.add(w);
        counts.set(w, (counts.get(w) ?? 0) + 1);
      }
    }
  }
  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, max)
    .map(([w]) => w);
}

function titleCase(s: string): string {
  return s.replace(/\b[a-z]/g, (c) => c.toUpperCase());
}

function monthYear(ms: number): string {
  return new Date(ms).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

export function heuristicChapters(ctx: StoryContext): StoryChapter[] {
  const n = ctx.entries.length;
  if (n === 0) return [];
  const raw: Array<{ startIndex: number; endIndex: number }> = [];
  let start = 0;
  for (let i = 1; i < n; i++) {
    const prev = ctx.entries[i - 1];
    const cur = ctx.entries[i];
    const newDay = new Date(prev.at).toDateString() !== new Date(cur.at).toDateString();
    if (newDay || cur.at - prev.at > CHAPTER_GAP_MS) {
      raw.push({ startIndex: start, endIndex: i - 1 });
      start = i;
    }
  }
  raw.push({ startIndex: start, endIndex: n - 1 });

  // Too many chapters: merge the smallest gaps first.
  while (raw.length > STORY_LIMITS.maxChapters) {
    let bestIdx = 1;
    let bestGap = Infinity;
    for (let i = 1; i < raw.length; i++) {
      const gap = ctx.entries[raw[i].startIndex].at - ctx.entries[raw[i - 1].endIndex].at;
      if (gap < bestGap) {
        bestGap = gap;
        bestIdx = i;
      }
    }
    raw[bestIdx - 1].endIndex = raw[bestIdx].endIndex;
    raw.splice(bestIdx, 1);
  }

  const chapters = raw.map((c) => {
    const slice = ctx.entries.slice(c.startIndex, c.endIndex + 1);
    const wordsTop = topWords(slice, 2);
    const title = wordsTop.length ? titleCase(wordsTop.join(' ')) : new Date(slice[0].at).toLocaleDateString('en-US', { weekday: 'long' });
    return { title, startIndex: c.startIndex, endIndex: c.endIndex };
  });
  return normaliseChapters(chapters, n);
}

export function heuristicTemplate(ctx: StoryContext): { style: StoryTemplateStyle; reasons: string[] } {
  const e = ctx.entries;
  if (e.length === 0) return { style: 'cinematic', reasons: ['Default for an empty selection'] };
  const faceShare = e.filter((x) => x.faces).length / e.length;
  const peopleShare = e.filter((x) => x.people).length / e.length;
  const videoShare = e.filter((x) => x.kind === 'video').length / e.length;
  const text = e.map((x) => `${x.scene ?? ''} ${x.caption ?? ''}`.toLowerCase()).join(' ');
  const has = (re: RegExp) => re.test(text);

  if (has(/neon|arcade|club|party|dance|dj|concert|glow/)) return { style: 'neon', reasons: ['Neon and night-life scenes dominate', 'Glow effects suit low light'] };
  if (has(/beach|sea|ocean|pool|sun|summer|palm|surf/)) return { style: 'summer', reasons: ['Sun and water scenes', 'Warm tones flatter bright light'] };
  if (has(/snow|ski|winter|frost|ice|christmas/)) return { style: 'winter', reasons: ['Snow and cold-weather scenes'] };
  if (has(/sunset|golden|dusk|wedding|romantic|evening light/)) return { style: 'golden', reasons: ['Golden-hour light in the captions'] };
  if (faceShare > 0.5 && videoShare > 0.5) return { style: 'dynamic', reasons: ['Many faces and video moments', 'Fast cuts keep people-heavy footage lively'] };
  if (has(/dark|dim|tunnel|cave|night/) && peopleShare > 0.5) return { style: 'electric', reasons: ['Dim, people-filled scenes', 'High-contrast accents lift low light'] };
  if (faceShare > 0.4) return { style: 'parallax', reasons: ['Portrait-heavy selection', 'Depth motion centres on faces'] };
  return { style: 'cinematic', reasons: ['Scenery and travel moments', 'Slow, elegant pacing for landmarks'] };
}

export function heuristicPacing(ctx: StoryContext): StoryPacing {
  const e = ctx.entries;
  if (e.length === 0) return 'steady';
  const videoShare = e.filter((x) => x.kind === 'video').length / e.length;
  const peopleShare = e.filter((x) => x.people).length / e.length;
  if (videoShare > 0.6 && peopleShare > 0.5) return 'fast';
  if (videoShare < 0.25) return 'calm';
  return 'steady';
}

export function heuristicShotList(ctx: StoryContext): StoryShot[] {
  const n = ctx.entries.length;
  const out: StoryShot[] = ctx.entries.map((e) => ({ index: e.index, role: 'beat' as const }));
  if (n === 0) return out;
  // Opener: the best-scoring shot with a face in the first half; else the best shot overall.
  const half = ctx.entries.slice(0, Math.max(1, Math.ceil(n / 2)));
  const withFace = half.filter((e) => e.faces).sort((a, b) => b.score - a.score)[0];
  const best = [...ctx.entries].sort((a, b) => b.score - a.score)[0];
  const opener = (withFace ?? best).index;
  out[opener].role = 'opener';
  if (n > 1) {
    const closer = n - 1 === opener ? n - 2 : n - 1;
    out[closer].role = 'closer';
  }
  // Breathers: low-motion scenery shots (photos without people) every so often.
  for (let i = 0; i < n; i++) {
    if (out[i].role !== 'beat') continue;
    const e = ctx.entries[i];
    if (e.kind === 'photo' && !e.people && i % 4 === 3) out[i].role = 'breather';
  }
  return out;
}

export function heuristicStoryPlan(ctx: StoryContext): StoryPlan {
  const place = topWords(ctx.entries, 2).map(titleCase);
  const when = ctx.startAt ? monthYear(ctx.startAt) : '';
  const title = [place.join(' & ') || 'Our Trip', when].filter(Boolean).join(', ').split(' ').slice(0, STORY_LIMITS.titleWords).join(' ');
  const days = ctx.dayCount;
  const photos = ctx.entries.filter((e) => e.kind === 'photo').length;
  const videos = ctx.entries.length - photos;
  const subtitle = `${days} day${days === 1 ? '' : 's'}, ${videos} moment${videos === 1 ? '' : 's'} and ${photos} photo${photos === 1 ? '' : 's'}`;
  const tpl = heuristicTemplate(ctx);
  const pacing = heuristicPacing(ctx);
  return {
    version: 1,
    source: 'heuristic',
    createdAt: Date.now(),
    keys: ctx.entries.map((e) => e.key),
    title,
    subtitle,
    chapters: heuristicChapters(ctx),
    templateStyle: tpl.style,
    templateReasons: tpl.reasons,
    pacing,
    musicMood: pacing === 'fast' ? 'upbeat energetic' : pacing === 'calm' ? 'warm acoustic' : 'bright indie pop',
    shotList: heuristicShotList(ctx),
  };
}
