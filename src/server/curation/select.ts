/**
 * Montage selection — pure. Given items and their curation records, choose an
 * ordered list of picks (photos and video highlight windows) for N slots.
 *
 * Rules: honour readiness (a pick the browser cannot play is worthless),
 * aim for `videoRatio` of the slots to be video, prefer higher scores, spread
 * picks across clips and scenes, and order chronologically by default so the
 * montage tells the day in sequence.
 */

import { assertServer } from '../runtime';
import type { CurationRecord, LibraryItem, MontagePick } from '@/types/library';

assertServer();

export interface SelectOptions {
  slots: number;
  /** Share of slots that should be video highlights when both kinds exist. Default 0.4. */
  videoRatio?: number;
  /** Order picks by capture time (default) instead of score. */
  chronological?: boolean;
  /** Item ids / highlight ids already in the project. */
  exclude?: ReadonlySet<string>;
}

interface Scored extends MontagePick {
  /** Capture time for ordering (item capture + offset into clip). */
  at: number;
  /** Lower-cased caption/scene words for diversity checks. */
  words: Set<string>;
}

export function pickId(itemId: string, highlightIndex?: number): string {
  return highlightIndex === undefined ? itemId : `${itemId}#${highlightIndex}`;
}

/** A video highlight is playable when its flat proxy exists, or when the clip itself is flat / has a full proxy. */
export function highlightReady(item: LibraryItem, record: CurationRecord, index: number): boolean {
  if (item.status.probe !== 'ready') return false;
  const h = record.highlights[index];
  if (!h) return false;
  if (!item.is360) return true;
  return h.proxy === 'ready' || item.status.proxy360 === 'ready';
}

const STOP = new Set(['a', 'an', 'the', 'of', 'in', 'on', 'at', 'with', 'and', 'to', 'from', 'under', 'through', 'over', 'into', 'by', 'for']);

function wordSet(...texts: Array<string | undefined>): Set<string> {
  const out = new Set<string>();
  for (const t of texts) {
    if (!t) continue;
    for (const w of t.toLowerCase().split(/[^a-z0-9]+/)) if (w.length > 2 && !STOP.has(w)) out.add(w);
  }
  return out;
}

function overlap(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let n = 0;
  a.forEach((w) => {
    if (b.has(w)) n += 1;
  });
  return n / Math.min(a.size, b.size);
}

function candidates(items: LibraryItem[], records: Map<string, CurationRecord>, exclude: ReadonlySet<string>): Scored[] {
  const out: Scored[] = [];
  for (const item of items) {
    const rec = records.get(item.id);
    if (!rec || item.status.probe !== 'ready') continue;
    const base = item.capturedAt ?? item.mtimeMs;
    if (item.kind === 'photo') {
      if (exclude.has(item.id)) continue;
      out.push({ itemId: item.id, kind: 'photo', score: rec.score, caption: rec.grade?.caption, at: base, words: wordSet(rec.grade?.caption, rec.grade?.scene) });
      continue;
    }
    for (const h of rec.highlights) {
      if (exclude.has(pickId(item.id, h.index)) || !highlightReady(item, rec, h.index)) continue;
      out.push({
        itemId: item.id,
        kind: 'video',
        highlightIndex: h.index,
        start: h.start,
        end: h.end,
        highlightProxyReady: item.is360 ? h.proxy === 'ready' : undefined,
        highlightPanReady: item.is360 ? h.panProxy === 'ready' : undefined,
        highlightPlanetReady: item.is360 ? h.planetProxy === 'ready' : undefined,
        viewVersion: h.view?.version,
        score: h.score,
        caption: h.caption,
        at: base + h.start * 1000,
        words: wordSet(h.caption, h.scene),
      });
    }
  }
  return out;
}

/**
 * Greedy pick with diversity: each candidate's score is discounted by how much
 * its words overlap the picks so far and by how many picks already come from
 * the same clip.
 */
function greedy(pool: Scored[], count: number, chosen: Scored[]): Scored[] {
  const picks: Scored[] = [];
  const perItem = new Map<string, number>();
  for (const c of chosen) perItem.set(c.itemId, (perItem.get(c.itemId) ?? 0) + 1);
  const remaining = [...pool];
  while (picks.length < count && remaining.length > 0) {
    let bestIdx = -1;
    let best = -Infinity;
    for (let i = 0; i < remaining.length; i++) {
      const c = remaining[i];
      const sameClip = perItem.get(c.itemId) ?? 0;
      const maxOverlap = Math.max(0, ...chosen.map((p) => overlap(c.words, p.words)), ...picks.map((p) => overlap(c.words, p.words)));
      const adjusted = c.score * (1 - 0.4 * maxOverlap) * Math.pow(0.75, sameClip);
      if (adjusted > best) {
        best = adjusted;
        bestIdx = i;
      }
    }
    const [pick] = remaining.splice(bestIdx, 1);
    picks.push(pick);
    perItem.set(pick.itemId, (perItem.get(pick.itemId) ?? 0) + 1);
  }
  return picks;
}

/**
 * Break up runs from the same clip by swapping the offending pick with the
 * nearest pick (either direction) that can take its place without creating a
 * new run. Slightly bends chronology; never leaves a swap that is worse.
 */
function separateSameClip(list: Scored[]): Scored[] {
  const out = [...list];
  const idAt = (k: number) => (k >= 0 && k < out.length ? out[k].itemId : undefined);
  for (let i = 1; i < out.length; i++) {
    if (out[i].itemId !== out[i - 1].itemId) continue;
    const moving = out[i];
    for (let d = 1; d < out.length; d++) {
      for (const j of [i + d, i - d]) {
        if (j < 0 || j >= out.length || j === i - 1) continue;
        const incoming = out[j];
        if (incoming.itemId === moving.itemId) continue;
        // `incoming` lands at i: must differ from its new neighbours.
        if (incoming.itemId === idAt(i - 1) || incoming.itemId === idAt(i + 1)) continue;
        // `moving` lands at j: must differ from its new neighbours (excluding itself at i).
        const left = j - 1 === i ? incoming.itemId : idAt(j - 1);
        const right = j + 1 === i ? incoming.itemId : idAt(j + 1);
        if (left === moving.itemId || right === moving.itemId) continue;
        [out[i], out[j]] = [incoming, moving];
        d = out.length; // done with this position
        break;
      }
    }
  }
  return out;
}

export function selectForMontage(items: LibraryItem[], records: Map<string, CurationRecord>, opts: SelectOptions): MontagePick[] {
  const slots = Math.max(0, Math.floor(opts.slots));
  if (slots === 0) return [];
  const videoRatio = Math.min(1, Math.max(0, opts.videoRatio ?? 0.4));
  const exclude = opts.exclude ?? new Set<string>();

  const all = candidates(items, records, exclude);
  const videos = all.filter((c) => c.kind === 'video');
  const photos = all.filter((c) => c.kind === 'photo');

  let videoTarget = Math.min(videos.length, Math.round(slots * videoRatio));
  let photoTarget = Math.min(photos.length, slots - videoTarget);
  // Fill any shortfall from whichever kind has more left.
  videoTarget = Math.min(videos.length, slots - photoTarget);
  photoTarget = Math.min(photos.length, slots - videoTarget);

  const videoPicks = greedy(videos, videoTarget, []);
  const photoPicks = greedy(photos, photoTarget, videoPicks);
  let picks = [...videoPicks, ...photoPicks];

  picks = opts.chronological === false ? picks.sort((a, b) => b.score - a.score) : separateSameClip(picks.sort((a, b) => a.at - b.at));

  return picks.map(({ at: _at, words: _words, ...pick }) => pick);
}
