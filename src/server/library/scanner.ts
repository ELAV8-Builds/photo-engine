/**
 * Folder scanner: walks a library root, classifies media, pairs Insta360
 * camera proxies with their full-resolution clips, and produces IndexedItems.
 *
 * Pure filesystem metadata only — no decoding happens here, so a scan of
 * thousands of files takes seconds. Probing/thumbnailing is queued afterwards.
 */

import crypto from 'crypto';
import fsp from 'fs/promises';
import path from 'path';
import { assertServer } from '../runtime';
import { toRelPosix } from '../fs/safe-path';
import type { FrameLayout, ItemStatus, MediaKind } from '@/types/library';
import type { IndexedItem } from './index-store';

assertServer();

const PHOTO_EXT = new Set(['jpg', 'jpeg', 'png', 'webp', 'heic', 'heif', 'tif', 'tiff', 'insp']);
const VIDEO_EXT = new Set(['mp4', 'mov', 'm4v', 'webm', 'mkv', 'insv']);
const CAMERA_PROXY_EXT = new Set(['lrv']);

/** Directories that are never worth walking. */
const SKIP_DIR_NAMES = new Set(['node_modules', '@eaDir', '.photoforge', 'Thumbnails', 'MISC', 'PRIVATE']);

/**
 * Insta360 naming: VID_20260724_113429_00_001.insv ↔ LRV_20260724_113429_01_001.lrv
 * The date, time and trailing sequence number match; the middle field differs.
 */
const INSTA360_NAME_RE = /^(VID|LRV|IMG|PRO_VID|PRO_LRV)_(\d{8})_(\d{6})_(\d{2})_(\d{3})\.(insv|lrv|insp)$/i;

/** Generic YYYYMMDD_HHMMSS embedded in a filename (Insta360, Android, Pixel…). */
const TIMESTAMP_IN_NAME_RE = /(?:^|[_-])(\d{4})(\d{2})(\d{2})[_-](\d{2})(\d{2})(\d{2})(?:\d{3})?(?:[_.-]|$)/;

export interface ScanResult {
  items: IndexedItem[];
  skippedDirs: number;
  durationMs: number;
}

interface FoundFile {
  absPath: string;
  name: string;
  ext: string;
  size: number;
  mtimeMs: number;
}

export function classifyExt(ext: string): MediaKind | 'camera-proxy' | null {
  if (PHOTO_EXT.has(ext)) return 'photo';
  if (VIDEO_EXT.has(ext)) return 'video';
  if (CAMERA_PROXY_EXT.has(ext)) return 'camera-proxy';
  return null;
}

export function layoutFor(ext: string): FrameLayout {
  if (ext === 'insv') return 'dual-fisheye-streams';
  if (ext === 'lrv') return 'dual-fisheye-sbs';
  return 'flat';
}

export function is360Ext(ext: string): boolean {
  return ext === 'insv' || ext === 'insp';
}

/** Stable identity for a file at a given root-relative path and version. */
export function itemIdFor(rootId: string, relPath: string, size: number, mtimeMs: number): string {
  return crypto
    .createHash('sha1')
    .update(`${rootId}\u0000${relPath}\u0000${size}\u0000${Math.round(mtimeMs)}`)
    .digest('hex')
    .slice(0, 20);
}

/** Capture time from a filename timestamp, interpreted as local time. */
export function captureTimeFromName(name: string): number | undefined {
  const m = TIMESTAMP_IN_NAME_RE.exec(name);
  if (!m) return undefined;
  const [, y, mo, d, h, mi, s] = m;
  const t = new Date(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), Number(s)).getTime();
  if (Number.isNaN(t)) return undefined;
  // Reject implausible values (e.g. random digit runs).
  const year = Number(y);
  if (year < 2000 || year > 2100) return undefined;
  return t;
}

/** Key that ties an Insta360 clip to its proxy: date_time_sequence. */
function insta360PairKey(name: string): string | undefined {
  const m = INSTA360_NAME_RE.exec(name);
  if (!m) return undefined;
  return `${m[2]}_${m[3]}_${m[5]}`.toLowerCase();
}

async function walk(dir: string, out: FoundFile[], counters: { skippedDirs: number }): Promise<void> {
  let entries;
  try {
    entries = await fsp.readdir(dir, { withFileTypes: true });
  } catch {
    counters.skippedDirs += 1;
    return;
  }

  for (const entry of entries) {
    const name = entry.name;
    if (name.startsWith('.')) continue;
    const full = path.join(dir, name);

    if (entry.isSymbolicLink()) continue; // never follow links out of the root
    if (entry.isDirectory()) {
      if (SKIP_DIR_NAMES.has(name)) {
        counters.skippedDirs += 1;
        continue;
      }
      await walk(full, out, counters);
      continue;
    }
    if (!entry.isFile()) continue;

    const ext = path.extname(name).slice(1).toLowerCase();
    if (!classifyExt(ext)) continue;

    try {
      const stat = await fsp.stat(full);
      out.push({ absPath: full, name, ext, size: stat.size, mtimeMs: stat.mtimeMs });
    } catch {
      // vanished mid-scan
    }
  }
}

const PENDING_STATUS = (kind: MediaKind, is360: boolean): ItemStatus => ({
  probe: 'pending',
  thumb: 'pending',
  signals: kind === 'video' ? 'pending' : 'skipped',
  proxy360: kind === 'video' && is360 ? 'pending' : 'skipped',
  curate: 'pending',
  // Decided by the curate step: 'pending' only when 360 highlights were chosen.
  highlights: kind === 'video' && is360 ? 'pending' : 'skipped',
});

/**
 * Scan a root. `previous` lets us carry over probe results and step statuses
 * for files whose identity (path + size + mtime) has not changed.
 */
export async function scanRoot(rootId: string, rootRealPath: string, previous: IndexedItem[] = []): Promise<ScanResult> {
  const started = Date.now();
  const found: FoundFile[] = [];
  const counters = { skippedDirs: 0 };
  await walk(rootRealPath, found, counters);

  // Pair camera proxies (.lrv) to their clips within the same directory.
  const proxiesByKey = new Map<string, FoundFile>();
  for (const f of found) {
    if (classifyExt(f.ext) !== 'camera-proxy') continue;
    const key = insta360PairKey(f.name);
    if (key) proxiesByKey.set(`${path.dirname(f.absPath)}|${key}`, f);
  }

  const prevById = new Map(previous.map((p) => [p.id, p]));
  const items: IndexedItem[] = [];

  for (const f of found) {
    const kind = classifyExt(f.ext);
    if (kind !== 'photo' && kind !== 'video') continue;

    const relPath = toRelPosix(rootRealPath, f.absPath);
    const id = itemIdFor(rootId, relPath, f.size, f.mtimeMs);
    const is360 = is360Ext(f.ext);

    let cameraProxyAbsPath: string | undefined;
    if (f.ext === 'insv') {
      const key = insta360PairKey(f.name);
      if (key) cameraProxyAbsPath = proxiesByKey.get(`${path.dirname(f.absPath)}|${key}`)?.absPath;
    }

    const prev = prevById.get(id);
    if (prev) {
      // Unchanged file: keep everything we already learned, refresh paths.
      items.push({ ...prev, absPath: f.absPath, cameraProxyAbsPath, hasCameraProxy: !!cameraProxyAbsPath });
      continue;
    }

    items.push({
      id,
      rootId,
      relPath,
      name: f.name,
      ext: f.ext,
      kind,
      sizeBytes: f.size,
      mtimeMs: f.mtimeMs,
      capturedAt: captureTimeFromName(f.name),
      is360,
      layout: layoutFor(f.ext),
      hasCameraProxy: !!cameraProxyAbsPath,
      status: PENDING_STATUS(kind, is360),
      absPath: f.absPath,
      cameraProxyAbsPath,
    });
  }

  items.sort((a, b) => (a.capturedAt ?? a.mtimeMs) - (b.capturedAt ?? b.mtimeMs) || a.relPath.localeCompare(b.relPath));

  return { items, skippedDirs: counters.skippedDirs, durationMs: Date.now() - started };
}
