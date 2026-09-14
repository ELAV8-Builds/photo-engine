/**
 * Phase 6 — cache inventory and garbage collection.
 *
 * Every cached artefact is named after the item id (20 hex chars) it belongs
 * to — plus a highlight index for per-moment clips and frames — or after the
 * hash of a shot list for story plans. Ownership is therefore decidable from
 * the filename: an artefact is orphaned when its item is in no root's index,
 * when its highlight index is beyond the item's current record, or when a
 * story plan names an item that no longer exists. Unrecognised names are
 * reported and never touched; `.<pid>.tmp` siblings belong to maintenance.
 *
 * Pure: `classifyArtifact`, `isOrphan`, `buildReport`. I/O below them.
 */

import fsp from 'fs/promises';
import path from 'path';
import { assertServer, dataPath, type DataSubdir } from '../runtime';
import { createLogger } from '../log';
import { TEMP_WITH_PID } from '../maintenance';
import { listRoots } from '../library/registry';
import { getItemsForRoot } from '../library/index-store';
import { loadCuration } from '../curation/record';
import type { ArtifactClass, StorageClassReport, StorageReport, StoryPlan } from '@/types/library';

assertServer();

const log = createLogger('storage');

export const ARTIFACT_CLASSES: readonly ArtifactClass[] = ['thumbnails', 'renditions', 'previews360', 'highlightClips', 'viewFrames', 'analysis', 'storyPlans'];

/** Cache directories the inventory walks (state/ and tmp/ are not cache). */
const CACHE_DIRS: readonly DataSubdir[] = ['thumbs', 'renditions', 'proxies', 'analysis'];

export type ArtifactRef =
  | { cls: ArtifactClass; owner: 'item'; itemId: string }
  | { cls: ArtifactClass; owner: 'highlight'; itemId: string; index: number }
  | { cls: 'storyPlans'; owner: 'story'; hash: string };

const ID = '([a-f0-9]{20})';

/** Filename rules per directory, mirroring the path helpers in thumbnails.ts, record.ts, signals.ts, user-views.ts and generate.ts. */
const RULES: ReadonlyArray<{ dir: DataSubdir; re: RegExp; build: (m: RegExpExecArray) => ArtifactRef }> = [
  { dir: 'thumbs', re: new RegExp(`^${ID}\\.jpg$`), build: (m) => ({ cls: 'thumbnails', owner: 'item', itemId: m[1] }) },
  { dir: 'thumbs', re: new RegExp(`^${ID}-hl-(\\d+)\\.jpg$`), build: (m) => ({ cls: 'thumbnails', owner: 'highlight', itemId: m[1], index: Number(m[2]) }) },
  { dir: 'thumbs', re: new RegExp(`^${ID}-hl-(\\d+)-view-[ab]--?\\d+--?\\d+\\.jpg$`), build: (m) => ({ cls: 'viewFrames', owner: 'highlight', itemId: m[1], index: Number(m[2]) }) },
  { dir: 'renditions', re: new RegExp(`^${ID}-(?:1024|2048|4096)\\.jpg$`), build: (m) => ({ cls: 'renditions', owner: 'item', itemId: m[1] }) },
  { dir: 'proxies', re: new RegExp(`^${ID}-flat720\\.mp4$`), build: (m) => ({ cls: 'previews360', owner: 'item', itemId: m[1] }) },
  { dir: 'proxies', re: new RegExp(`^${ID}-hl-(\\d+)(?:-pan|-planet)?\\.mp4$`), build: (m) => ({ cls: 'highlightClips', owner: 'highlight', itemId: m[1], index: Number(m[2]) }) },
  { dir: 'analysis', re: new RegExp(`^${ID}\\.(?:signals|curation|curation\\.partial|views)\\.json$`), build: (m) => ({ cls: 'analysis', owner: 'item', itemId: m[1] }) },
  { dir: 'analysis', re: new RegExp(`^story-${ID}\\.json$`), build: (m) => ({ cls: 'storyPlans', owner: 'story', hash: m[1] }) },
];

/** Which artefact a cache filename is, or null when the name is not one of ours. */
export function classifyArtifact(dir: DataSubdir, name: string): ArtifactRef | null {
  for (const rule of RULES) {
    if (rule.dir !== dir) continue;
    const m = rule.re.exec(name);
    if (m) return rule.build(m);
  }
  return null;
}

/** What exists right now, as far as orphan decisions need to know. */
export interface KnownState {
  itemIds: ReadonlySet<string>;
  /** Highlight windows the item's record currently holds (0 without a record). */
  highlightCount(itemId: string): Promise<number>;
  /** Item ids a story plan names, or null when the plan file is unreadable. */
  storyItemIds(hash: string): Promise<string[] | null>;
}

export async function isOrphan(ref: ArtifactRef, known: KnownState): Promise<boolean> {
  switch (ref.owner) {
    case 'item':
      return !known.itemIds.has(ref.itemId);
    case 'highlight':
      return !known.itemIds.has(ref.itemId) || ref.index >= (await known.highlightCount(ref.itemId));
    case 'story': {
      const ids = await known.storyItemIds(ref.hash);
      return ids === null || ids.some((id) => !known.itemIds.has(id));
    }
  }
}

export interface InventoryEntry {
  absPath: string;
  bytes: number;
  ref: ArtifactRef | null;
  orphan: boolean;
}

export function buildReport(entries: readonly InventoryEntry[]): StorageReport {
  const byClass = new Map<ArtifactClass, StorageClassReport>(ARTIFACT_CLASSES.map((c) => [c, { class: c, files: 0, bytes: 0, orphanFiles: 0, orphanBytes: 0 }]));
  const report: StorageReport = {
    scannedAt: Date.now(),
    classes: [],
    totalFiles: 0,
    totalBytes: 0,
    orphanFiles: 0,
    orphanBytes: 0,
    unrecognisedFiles: 0,
    unrecognisedBytes: 0,
  };
  for (const e of entries) {
    report.totalFiles += 1;
    report.totalBytes += e.bytes;
    if (!e.ref) {
      report.unrecognisedFiles += 1;
      report.unrecognisedBytes += e.bytes;
      continue;
    }
    const c = byClass.get(e.ref.cls)!;
    c.files += 1;
    c.bytes += e.bytes;
    if (e.orphan) {
      c.orphanFiles += 1;
      c.orphanBytes += e.bytes;
      report.orphanFiles += 1;
      report.orphanBytes += e.bytes;
    }
  }
  report.classes = ARTIFACT_CLASSES.map((c) => byClass.get(c)!);
  return report;
}

// ---------------------------------------------------------------------------
// I/O
// ---------------------------------------------------------------------------

async function knownState(): Promise<KnownState> {
  const itemIds = new Set<string>();
  for (const root of await listRoots()) for (const item of await getItemsForRoot(root.id)) itemIds.add(item.id);
  const counts = new Map<string, Promise<number>>();
  return {
    itemIds,
    highlightCount(itemId) {
      let p = counts.get(itemId);
      if (!p) {
        p = loadCuration(itemId).then((r) => r?.highlights.length ?? 0);
        counts.set(itemId, p);
      }
      return p;
    },
    async storyItemIds(hash) {
      try {
        const plan = JSON.parse(await fsp.readFile(dataPath('analysis', `story-${hash}.json`), 'utf8')) as Partial<StoryPlan>;
        if (plan.version !== 1 || !Array.isArray(plan.keys)) return null;
        return plan.keys.map((k) => String(k).split('#')[0]);
      } catch {
        return null;
      }
    },
  };
}

async function inventory(): Promise<InventoryEntry[]> {
  const known = await knownState();
  const entries: InventoryEntry[] = [];
  for (const subdir of CACHE_DIRS) {
    const dir = dataPath(subdir);
    let names: string[];
    try {
      names = await fsp.readdir(dir);
    } catch {
      continue;
    }
    for (const name of names) {
      if (TEMP_WITH_PID.test(name)) continue;
      const absPath = path.join(dir, name);
      let size: number;
      try {
        const stat = await fsp.stat(absPath);
        if (!stat.isFile()) continue;
        size = stat.size;
      } catch {
        continue; // vanished between readdir and stat
      }
      const ref = classifyArtifact(subdir, name);
      entries.push({ absPath, bytes: size, ref, orphan: ref ? await isOrphan(ref, known) : false });
    }
  }
  return entries;
}

export async function readStorageReport(): Promise<StorageReport> {
  return buildReport(await inventory());
}

export interface ClearResult {
  removedFiles: number;
  removedBytes: number;
  report: StorageReport;
}

/** Delete every orphaned artefact. Only paths this module classified inside the cache directories are ever removed. */
export async function clearOrphans(): Promise<ClearResult> {
  const entries = await inventory();
  let removedFiles = 0;
  let removedBytes = 0;
  for (const e of entries) {
    if (!e.orphan) continue;
    await fsp.rm(e.absPath, { force: true });
    removedFiles += 1;
    removedBytes += e.bytes;
  }
  if (removedFiles > 0) log.info('orphaned artefacts removed', { files: removedFiles, bytes: removedBytes });
  return { removedFiles, removedBytes, report: buildReport(entries.filter((e) => !e.orphan)) };
}
