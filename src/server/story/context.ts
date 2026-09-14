/**
 * Story context — the compact, privacy-safe view of a selection that the
 * story pass reasons over. Captions, scene words, dates, kinds and scores
 * only: no paths, no filenames, no EXIF beyond capture time.
 *
 * Pure functions.
 */

import { assertServer } from '../runtime';
import type { CurationRecord, LibraryItem, StoryContext, StoryContextEntry } from '@/types/library';

assertServer();

export const STORY_MAX_ENTRIES = 120;

export interface ContextSource {
  item: LibraryItem;
  record: CurationRecord;
}

/** Parse `itemId` / `itemId#n` keys. Returns null for malformed keys. */
export function parseKey(key: string): { itemId: string; highlightIndex?: number } | null {
  const m = /^([a-f0-9]{20})(?:#(\d{1,2}))?$/.exec(key);
  if (!m) return null;
  return { itemId: m[1], highlightIndex: m[2] === undefined ? undefined : Number(m[2]) };
}

function entryFor(key: string, source: ContextSource, index: number): StoryContextEntry | null {
  const { item, record } = source;
  const base = item.capturedAt ?? item.mtimeMs;
  const parsed = parseKey(key);
  if (!parsed) return null;
  if (parsed.highlightIndex === undefined) {
    if (item.kind === 'video') {
      // Whole clip: describe it by its best moment.
      const top = record.highlights[0];
      return {
        index,
        key,
        kind: 'video',
        at: base,
        caption: top?.caption ?? record.grade?.caption,
        scene: top?.scene ?? record.grade?.scene,
        people: top?.people ?? record.grade?.people ?? false,
        faces: top?.faces ?? record.grade?.faces ?? false,
        score: record.score,
        durationSec: item.probe?.durationSec,
      };
    }
    return {
      index,
      key,
      kind: 'photo',
      at: base,
      caption: record.grade?.caption,
      scene: record.grade?.scene,
      people: record.grade?.people ?? false,
      faces: record.grade?.faces ?? false,
      score: record.score,
    };
  }
  const h = record.highlights.find((w) => w.index === parsed.highlightIndex);
  if (!h) return null;
  return {
    index,
    key,
    kind: 'video',
    at: base + h.start * 1000,
    caption: h.caption,
    scene: h.scene,
    people: h.people,
    faces: h.faces,
    score: h.score,
    durationSec: h.end - h.start,
  };
}

/** Keep at most `max` entries, spread evenly across the list (always keeps first and last). */
export function downsample<T>(list: T[], max: number): T[] {
  if (list.length <= max) return list;
  const out: T[] = [];
  for (let i = 0; i < max; i++) out.push(list[Math.round((i * (list.length - 1)) / (max - 1))]);
  return out;
}

/**
 * Build the context for an ordered list of keys. Unknown keys are skipped.
 * Order is preserved (the caller decides whether that is project order or time order).
 */
export function buildStoryContext(keys: string[], sources: Map<string, ContextSource>): StoryContext {
  const raw: StoryContextEntry[] = [];
  const seen = new Set<string>();
  for (const key of keys) {
    if (seen.has(key)) continue;
    const parsed = parseKey(key);
    if (!parsed) continue;
    const source = sources.get(parsed.itemId);
    if (!source) continue;
    const e = entryFor(key, source, raw.length);
    if (e) {
      raw.push(e);
      seen.add(key);
    }
  }
  const entries = downsample(raw, STORY_MAX_ENTRIES).map((e, i) => ({ ...e, index: i }));
  const times = entries.map((e) => e.at).filter((t) => Number.isFinite(t));
  const startAt = times.length ? Math.min(...times) : 0;
  const endAt = times.length ? Math.max(...times) : 0;
  const days = new Set(entries.map((e) => new Date(e.at).toDateString()));
  return { entries, startAt, endAt, dayCount: Math.max(1, days.size) };
}

/** Default shot order when the caller has no picks: every curated photo plus each video's top highlight, by time. */
export function defaultKeys(sources: Map<string, ContextSource>): string[] {
  const list: Array<{ key: string; at: number }> = [];
  sources.forEach(({ item, record }) => {
    const base = item.capturedAt ?? item.mtimeMs;
    if (item.kind === 'photo') list.push({ key: item.id, at: base });
    else for (const h of record.highlights) list.push({ key: `${item.id}#${h.index}`, at: base + h.start * 1000 });
  });
  return list.sort((a, b) => a.at - b.at).map((x) => x.key);
}
