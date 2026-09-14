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
 * filenames, so stale clips must not survive to be mistaken for finished work.
 */
export async function removeCuration(itemId: string): Promise<void> {
  await fsp.rm(curationPath(itemId), { force: true });
  await fsp.rm(curationPartialPath(itemId), { force: true });
  for (let n = 0; n < MAX_HIGHLIGHTS; n++) {
    await fsp.rm(highlightProxyPath(itemId, n), { force: true });
    await fsp.rm(highlightThumbPath(itemId, n), { force: true });
  }
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
