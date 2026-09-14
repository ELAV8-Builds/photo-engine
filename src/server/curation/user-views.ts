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
import { clampPath } from '../media/pan';
import { panDecision, simplifyPath } from '../analysis/pan-plan';
import type { CurationRecord, HighlightView, HighlightWindow, ViewKeyframe } from '@/types/library';

assertServer();

export interface RememberedView {
  /** The window (clip seconds) the view was chosen for. */
  start: number;
  end: number;
  /** Always `source: 'user'`. */
  view: HighlightView;
  /** v2 (Phase 8 §3.2): a kept pan — keyframe times relative to `start`; ≥ 2 entries. */
  viewPath?: ViewKeyframe[];
  /** v2 (Phase 8 §3.2): the tiny planet's user spin (±180°). Absent = 0. */
  planetRotationDeg?: number;
}

export interface UserViewMemory {
  /** v2 added `viewPath`/`planetRotationDeg` per entry (owner-approved); v1 files are still read. */
  version: 1 | 2;
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
 * v2 (Phase 8 §3.2): re-anchor a remembered pan onto a (possibly different)
 * window: keyframe times scale proportionally onto the new span, then the same
 * clamp → simplify → panDecision the planner applies decides whether the result
 * is still a pan. Null means restore as a static view.
 */
export function anchorRememberedPath(m: RememberedView, win: Span): ViewKeyframe[] | null {
  if (!m.viewPath || m.viewPath.length < 2) return null;
  const oldLen = m.end - m.start;
  const newLen = win.end - win.start;
  if (!(oldLen > 0) || !(newLen > 0)) return null;
  const mapped = m.viewPath.map((k) => ({
    t: Math.round((win.start + (k.t / oldLen) * newLen) * 10) / 10,
    yawDeg: k.yawDeg,
    pitchDeg: k.pitchDeg,
  }));
  const path = simplifyPath(clampPath(mapped));
  return panDecision(path) === 'pan' ? path : null;
}

/**
 * v2 (Phase 8 §3.2): the memory entry for a window as it stands — the view plus
 * any kept pan (made window-relative) and planet spin. Callers ensure `view`.
 */
export function rememberedFromWindow(h: HighlightWindow): RememberedView {
  const entry: RememberedView = { start: h.start, end: h.end, view: h.view! };
  if (h.viewPath && h.viewPath.length >= 2) entry.viewPath = h.viewPath.map((k) => ({ t: k.t - h.start, yawDeg: k.yawDeg, pitchDeg: k.pitchDeg }));
  if (h.planetRotationDeg) entry.planetRotationDeg = h.planetRotationDeg;
  return entry;
}

/**
 * Give freshly curated windows their remembered user views: the view becomes
 * `source: 'user'` with a bumped version (the clip content changes, so cached
 * URLs must too), a remembered pan re-anchors onto the new window (v2 —
 * otherwise the path collapses to a static keyframe), the planet spin is
 * restored, and the flat clip is marked for rendering. Returns the count.
 */
export function applyRememberedViews(windows: HighlightWindow[], remembered: RememberedView[]): number {
  // Only windows that carry a view (360) can take one; never let a flat window claim a match.
  const matches = matchRememberedViews(windows.filter((h) => h.view), remembered);
  let restored = 0;
  for (const h of windows) {
    const m = matches.get(h.index);
    if (!m || !h.view) continue;
    h.view = { lens: m.view.lens, yawDeg: m.view.yawDeg, pitchDeg: m.view.pitchDeg, source: 'user', version: (m.view.version ?? 0) + 1 };
    const pan = anchorRememberedPath(m, h);
    if (pan) {
      h.viewPath = pan;
      h.panProxy = 'pending';
    } else {
      h.viewPath = [{ t: h.start, yawDeg: m.view.yawDeg, pitchDeg: m.view.pitchDeg }];
      h.panProxy = undefined;
    }
    h.planetRotationDeg = m.planetRotationDeg;
    h.proxy = 'pending';
    restored += 1;
  }
  return restored;
}

// ---------------------------------------------------------------------------
// I/O
// ---------------------------------------------------------------------------

const isFiniteNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/**
 * Validate one entry from disk (§3.6: every new field is validated on read).
 * A malformed v2 field degrades to the v1 meaning (static view, no spin);
 * a malformed core entry is dropped.
 */
function sanitizeEntry(raw: RememberedView): RememberedView | null {
  if (!raw || !isFiniteNum(raw.start) || !isFiniteNum(raw.end) || !raw.view) return null;
  const v = raw.view;
  if ((v.lens !== 'a' && v.lens !== 'b') || !isFiniteNum(v.yawDeg) || !isFiniteNum(v.pitchDeg)) return null;
  const entry: RememberedView = { start: raw.start, end: raw.end, view: v };
  if (Array.isArray(raw.viewPath) && raw.viewPath.length >= 2 && raw.viewPath.every((k) => k && isFiniteNum(k.t) && isFiniteNum(k.yawDeg) && isFiniteNum(k.pitchDeg))) {
    entry.viewPath = raw.viewPath.map((k) => ({ t: k.t, yawDeg: k.yawDeg, pitchDeg: k.pitchDeg }));
  }
  if (isFiniteNum(raw.planetRotationDeg) && raw.planetRotationDeg !== 0) {
    entry.planetRotationDeg = Math.max(-180, Math.min(180, Math.round(raw.planetRotationDeg)));
  }
  return entry;
}

export async function loadUserViews(itemId: string): Promise<RememberedView[]> {
  const p = userViewsPath(itemId);
  if (!(await fileExists(p))) return [];
  try {
    const memory = JSON.parse(await fsp.readFile(p, 'utf8')) as UserViewMemory;
    if ((memory.version !== 1 && memory.version !== 2) || !Array.isArray(memory.views)) return [];
    return memory.views.map(sanitizeEntry).filter((e): e is RememberedView => e !== null);
  } catch {
    return [];
  }
}

async function saveUserViews(itemId: string, views: RememberedView[]): Promise<void> {
  await writeJsonAtomic(userViewsPath(itemId), { version: 2, itemId, views } satisfies UserViewMemory);
}

/** Remember one hand-set view (called when the user applies a view). */
export async function rememberUserView(itemId: string, entry: RememberedView): Promise<void> {
  await saveUserViews(itemId, remember(await loadUserViews(itemId), entry));
}

/**
 * Remember every user-set window of a record about to be discarded — view plus
 * kept pan and planet spin (v2). Covers records whose views were set before
 * this memory existed. Returns the count.
 */
export async function rememberUserViewsFrom(record: CurationRecord): Promise<number> {
  const userWindows = record.highlights.filter((h) => h.view?.source === 'user');
  if (userWindows.length === 0) return 0;
  let views = await loadUserViews(record.itemId);
  for (const h of userWindows) views = remember(views, rememberedFromWindow(h));
  await saveUserViews(record.itemId, views);
  return userWindows.length;
}
