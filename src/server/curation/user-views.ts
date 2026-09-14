/**
 * Phase 6 — memory of hand-set 360 views, one file per item at
 * `cache/analysis/<id>.views.json`.
 *
 * A forced re-analysis rebuilds a record's windows from scratch, so the record
 * itself cannot carry the user's view choices across it. This file can: every
 * user-set view is remembered by the window it was chosen for, and after a
 * fresh curation each new window adopts the remembered view that overlaps it
 * most in time. The matching is pure (`matchRememberedViews`); I/O is below.
 * `removeCuration` deliberately leaves this file alone; cache GC removes it
 * once the item is gone.
 */

import fsp from 'fs/promises';
import { assertServer, dataPath, fileExists, writeJsonAtomic } from '../runtime';
import type { CurationRecord, HighlightView, HighlightWindow } from '@/types/library';

assertServer();

export interface RememberedView {
  /** The window (clip seconds) the view was chosen for. */
  start: number;
  end: number;
  /** Always `source: 'user'`. */
  view: HighlightView;
}

export interface UserViewMemory {
  version: 1;
  itemId: string;
  views: RememberedView[];
}

/** Two windows must share at least this much time to count as the same moment. */
export const MIN_OVERLAP_SEC = 0.5;

export function userViewsPath(itemId: string): string {
  return dataPath('analysis', `${itemId}.views.json`);
}

type Span = { start: number; end: number };

export function overlapSec(a: Span, b: Span): number {
  return Math.max(0, Math.min(a.end, b.end) - Math.max(a.start, b.start));
}

/** Add `entry`, replacing any remembered view for the same moment (overlapping window). */
export function remember(views: RememberedView[], entry: RememberedView): RememberedView[] {
  return [...views.filter((v) => overlapSec(v, entry) < MIN_OVERLAP_SEC), entry];
}

/**
 * Pair each window with the remembered view it overlaps most. Greedy on
 * overlap, each remembered view used at most once, ties to the earlier window.
 * Returns window index → remembered view.
 */
export function matchRememberedViews(windows: Array<Pick<HighlightWindow, 'index' | 'start' | 'end'>>, remembered: RememberedView[]): Map<number, RememberedView> {
  const pairs: Array<{ w: number; r: number; overlap: number }> = [];
  for (const w of windows) {
    remembered.forEach((r, ri) => {
      const overlap = overlapSec(w, r);
      if (overlap >= MIN_OVERLAP_SEC) pairs.push({ w: w.index, r: ri, overlap });
    });
  }
  pairs.sort((a, b) => b.overlap - a.overlap || a.w - b.w);
  const out = new Map<number, RememberedView>();
  const used = new Set<number>();
  for (const p of pairs) {
    if (out.has(p.w) || used.has(p.r)) continue;
    out.set(p.w, remembered[p.r]);
    used.add(p.r);
  }
  return out;
}

/**
 * Give freshly curated windows their remembered user views: the view becomes
 * `source: 'user'` with a bumped version (the clip content changes, so cached
 * URLs must too), the path collapses to a static keyframe (no pan), and the
 * flat clip is marked for rendering. Returns how many windows were restored.
 */
export function applyRememberedViews(windows: HighlightWindow[], remembered: RememberedView[]): number {
  // Only windows that carry a view (360) can take one; never let a flat window claim a match.
  const matches = matchRememberedViews(windows.filter((h) => h.view), remembered);
  let restored = 0;
  for (const h of windows) {
    const m = matches.get(h.index);
    if (!m || !h.view) continue;
    h.view = { lens: m.view.lens, yawDeg: m.view.yawDeg, pitchDeg: m.view.pitchDeg, source: 'user', version: (m.view.version ?? 0) + 1 };
    h.viewPath = [{ t: h.start, yawDeg: m.view.yawDeg, pitchDeg: m.view.pitchDeg }];
    h.panProxy = undefined;
    h.proxy = 'pending';
    restored += 1;
  }
  return restored;
}

// ---------------------------------------------------------------------------
// I/O
// ---------------------------------------------------------------------------

export async function loadUserViews(itemId: string): Promise<RememberedView[]> {
  const p = userViewsPath(itemId);
  if (!(await fileExists(p))) return [];
  try {
    const memory = JSON.parse(await fsp.readFile(p, 'utf8')) as UserViewMemory;
    return memory.version === 1 && Array.isArray(memory.views) ? memory.views : [];
  } catch {
    return [];
  }
}

async function saveUserViews(itemId: string, views: RememberedView[]): Promise<void> {
  await writeJsonAtomic(userViewsPath(itemId), { version: 1, itemId, views } satisfies UserViewMemory);
}

/** Remember one hand-set view (called when the user applies a view). */
export async function rememberUserView(itemId: string, entry: RememberedView): Promise<void> {
  await saveUserViews(itemId, remember(await loadUserViews(itemId), entry));
}

/**
 * Remember every user-set window of a record about to be discarded. Covers
 * records whose views were set before this memory existed. Returns the count.
 */
export async function rememberUserViewsFrom(record: CurationRecord): Promise<number> {
  const userWindows = record.highlights.filter((h) => h.view?.source === 'user');
  if (userWindows.length === 0) return 0;
  let views = await loadUserViews(record.itemId);
  for (const h of userWindows) views = remember(views, { start: h.start, end: h.end, view: h.view! });
  await saveUserViews(record.itemId, views);
  return userWindows.length;
}
