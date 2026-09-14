/**
 * Curation records on disk: `cache/analysis/<id>.curation.json` (final) and
 * `<id>.curation.partial.json` (grades so far, so a restart resumes instead
 * of re-grading). Both are written atomically.
 */

import fsp from 'fs/promises';
import { assertServer, dataPath, fileExists, writeJsonAtomic } from '../runtime';
import { highlightThumbPath } from '../media/thumbnails';
import type { CurationRecord, CurationSummary, FrameGrade } from '@/types/library';

assertServer();

export function curationPath(itemId: string): string {
  return dataPath('analysis', `${itemId}.curation.json`);
}

export function curationPartialPath(itemId: string): string {
  return dataPath('analysis', `${itemId}.curation.partial.json`);
}

export function highlightProxyPath(itemId: string, index: number): string {
  return dataPath('proxies', `${itemId}-hl-${index}.mp4`);
}

/** Phase 5: panning flat clip for a highlight window. */
export function highlightPanPath(itemId: string, index: number): string {
  return dataPath('proxies', `${itemId}-hl-${index}-pan.mp4`);
}

/** Phase 5: square tiny-planet clip for a highlight window. */
export function highlightPlanetPath(itemId: string, index: number): string {
  return dataPath('proxies', `${itemId}-hl-${index}-planet.mp4`);
}

/**
 * Yaw-editor preview frames may be requested anywhere inside a window plus this
 * margin (the same 0.5 s the highlight renders carry). The GC uses the same
 * bound to decide whether a cached frame still belongs to a window.
 */
export const HIGHLIGHT_FRAME_MARGIN_SEC = 0.5;

/**
 * Phase 5: cached yaw-editor preview frame. Phase 7 names it by the frame's
 * source time (0.1 s resolution) instead of the window index, so the cache
 * stays valid across re-analysis; angles are whole degrees, rounded by the caller.
 */
export function viewFramePath(itemId: string, atSec: number, lens: 'a' | 'b', yawDeg: number, pitchDeg: number): string {
  return dataPath('thumbs', `${itemId}-view-${atSec.toFixed(1)}-${lens}-${yawDeg}-${pitchDeg}.jpg`);
}

/** Remove every rendered artefact of one window (clip, pan, planet, thumb) so a new view re-renders cleanly. */
export async function removeHighlightArtifacts(itemId: string, index: number): Promise<void> {
  await Promise.all([
    fsp.rm(highlightProxyPath(itemId, index), { force: true }),
    fsp.rm(highlightPanPath(itemId, index), { force: true }),
    fsp.rm(highlightPlanetPath(itemId, index), { force: true }),
    fsp.rm(highlightThumbPath(itemId, index), { force: true }),
  ]);
}

export async function loadCuration(itemId: string): Promise<CurationRecord | null> {
  const p = curationPath(itemId);
  if (!(await fileExists(p))) return null;
  try {
    const rec = JSON.parse(await fsp.readFile(p, 'utf8')) as CurationRecord;
    return rec.version === 1 ? rec : null;
  } catch {
    return null;
  }
}

export async function saveCuration(record: CurationRecord): Promise<void> {
  await writeJsonAtomic(curationPath(record.itemId), record);
}

/** Highest number of highlight windows a record can hold (see highlightCap). */
const MAX_HIGHLIGHTS = 8;

/**
 * Forget an item's curation entirely: record, partial grades, and every rendered
 * highlight clip/thumbnail. A re-run chooses new windows under the same
 * filenames, so stale artefacts must not survive to be mistaken for finished
 * work. Remembered user views (`user-views.ts`) are deliberately kept, and so
 * are yaw-editor frames: Phase 7 names them by source time, so they stay
 * correct for whatever windows a re-analysis picks (the GC reclaims frames no
 * window covers any more).
 */
export async function removeCuration(itemId: string): Promise<void> {
  await fsp.rm(curationPath(itemId), { force: true });
  await fsp.rm(curationPartialPath(itemId), { force: true });
  for (let n = 0; n < MAX_HIGHLIGHTS; n++) await removeHighlightArtifacts(itemId, n);
}

/** Grades keyed by sample time (string seconds) for one model. */
export interface PartialCuration {
  version: 1;
  itemId: string;
  model: string;
  grades: Record<string, FrameGrade>;
}

export async function loadPartial(itemId: string, model: string): Promise<PartialCuration | null> {
  const p = curationPartialPath(itemId);
  if (!(await fileExists(p))) return null;
  try {
    const partial = JSON.parse(await fsp.readFile(p, 'utf8')) as PartialCuration;
    return partial.version === 1 && partial.model === model ? partial : null;
  } catch {
    return null;
  }
}

export async function savePartial(partial: PartialCuration): Promise<void> {
  await writeJsonAtomic(curationPartialPath(partial.itemId), partial);
}

export async function clearPartial(itemId: string): Promise<void> {
  await fsp.rm(curationPartialPath(itemId), { force: true });
}

/** The compact form stored on the item for lists and sorting. */
export function summarize(record: CurationRecord): CurationSummary {
  const top = record.highlights[0];
  const grade = record.grade;
  return {
    score: record.score,
    highlightCount: record.highlights.length,
    caption: top?.caption ?? grade?.caption,
    scene: top?.scene ?? grade?.scene,
    people: top?.people ?? grade?.people ?? false,
    faces: top?.faces ?? grade?.faces ?? false,
    model: record.model,
    gradedAt: record.createdAt,
  };
}
