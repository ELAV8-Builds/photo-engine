/**
 * Thumbnails and image renditions.
 *
 * Thumbnails (≤512px) feed the library grid. Renditions (1024/2048/4096) feed
 * the renderer so it never has to decode a 48-megapixel HEIC in the browser.
 * Both are cached under the app data directory keyed by item id, so a file
 * that changes (new id) gets fresh artefacts automatically.
 *
 * HEIC/HEIF are handled by macOS `sips`, which honours EXIF orientation;
 * everything else goes through ffmpeg.
 */

import fsp from 'fs/promises';
import path from 'path';
import { assertServer, dataPath, fileExists, globalSingleton } from '../runtime';
import { findTool } from './binaries';
import { run, runFfmpeg, runFfprobeJson, type FfmpegOptions } from './ffmpeg';
import { DEFAULT_VIEW, flatViewFilter } from './reframe';
import type { IndexedItem } from '../library/index-store';

assertServer();

export const THUMB_MAX_PX = 512;
export const RENDITION_SIZES = [1024, 2048, 4096] as const;
export type RenditionSize = (typeof RENDITION_SIZES)[number];

const HEIF_EXT = new Set(['heic', 'heif']);

export function thumbPath(itemId: string): string {
  return dataPath('thumbs', `${itemId}.jpg`);
}

export function renditionPath(itemId: string, max: RenditionSize): string {
  return dataPath('renditions', `${itemId}-${max}.jpg`);
}

export function proxyPath(itemId: string): string {
  return dataPath('proxies', `${itemId}-flat720.mp4`);
}

/** Write to a temp sibling and rename so a half-written JPEG is never served. */
async function withAtomicOutput(finalPath: string, produce: (tmpPath: string) => Promise<void>): Promise<void> {
  await fsp.mkdir(path.dirname(finalPath), { recursive: true });
  const tmp = `${finalPath}.${process.pid}.tmp${path.extname(finalPath)}`;
  try {
    await produce(tmp);
    await fsp.rename(tmp, finalPath);
  } catch (err) {
    await fsp.rm(tmp, { force: true });
    throw err;
  }
}

async function resizeWithFfmpeg(input: string, output: string, maxPx: number, opts: FfmpegOptions): Promise<void> {
  // force_original_aspect_ratio=decrease keeps the image inside a maxPx box without upscaling.
  // ffmpeg applies EXIF orientation while decoding, so the output pixels are upright.
  const scale = `scale='min(${maxPx},iw)':'min(${maxPx},ih)':force_original_aspect_ratio=decrease`;
  await runFfmpeg(['-i', input], ['-frames:v', '1', '-vf', scale, '-q:v', '3', '-f', 'image2', output], {
    ...opts,
    hwaccel: false,
    timeoutMs: 60_000,
  });
}

/**
 * HEIC/HEIF → JPEG. sips does the heavy decode but leaves pixels unrotated with
 * an Orientation tag; a second, cheap ffmpeg pass bakes the rotation in so
 * every artefact we serve has upright pixels and no orientation metadata.
 */
async function resizeHeifToJpeg(input: string, output: string, maxPx: number, opts: FfmpegOptions): Promise<void> {
  const sips = findTool('sips');
  if (!sips) throw new Error('HEIC conversion requires macOS sips');
  const intermediate = `${output}.sips.jpg`;
  try {
    await run(sips, ['-Z', String(maxPx), '-s', 'format', 'jpeg', '-s', 'formatOptions', '92', input, '--out', intermediate], {
      timeoutMs: 120_000,
      signal: opts.signal,
    });
    await resizeWithFfmpeg(intermediate, output, maxPx, opts);
  } finally {
    await fsp.rm(intermediate, { force: true });
  }
}

/** Timestamp for a representative video frame: 1 s in, or the middle of very short clips. */
function representativeTime(durationSec?: number): number {
  if (!durationSec || durationSec <= 0) return 0;
  return durationSec > 2 ? 1 : durationSec / 2;
}

/**
 * Produce the grid thumbnail for an item. Photos: resized copy. Flat videos: a
 * frame. 360 videos: a flat reframe of lens A, preferring the camera's small
 * .lrv proxy over decoding 8K HEVC.
 */
export async function generateThumbnail(item: IndexedItem, opts: FfmpegOptions = {}): Promise<string> {
  const out = thumbPath(item.id);
  if (await fileExists(out)) return out;

  await withAtomicOutput(out, async (tmp) => {
    if (item.kind === 'photo') {
      if (HEIF_EXT.has(item.ext)) {
        await resizeHeifToJpeg(item.absPath, tmp, THUMB_MAX_PX, opts);
      } else {
        await resizeWithFfmpeg(item.absPath, tmp, THUMB_MAX_PX, opts);
      }
      return;
    }

    const durationSec = item.probe?.durationSec;
    const seek = representativeTime(durationSec);
    // 16:9 to match the flat 720p proxy exactly, so face coordinates scale uniformly.
    const size = { width: THUMB_MAX_PX, height: Math.round((THUMB_MAX_PX * 9) / 16) };

    // Prefer the camera proxy for 360 clips: tiny H.264 instead of 8K HEVC.
    const useProxy = item.layout === 'dual-fisheye-streams' && item.cameraProxyAbsPath && (await fileExists(item.cameraProxyAbsPath));
    const input = useProxy ? item.cameraProxyAbsPath! : item.absPath;
    const layout = useProxy ? 'dual-fisheye-sbs' : item.layout;

    const reframe = flatViewFilter(layout, 'a', DEFAULT_VIEW, size);
    const filter = reframe?.filter ?? `scale='min(${THUMB_MAX_PX},iw)':-2`;
    const mapArgs = reframe?.mapArgs ?? ['-map', '0:v:0'];

    await runFfmpeg(
      ['-ss', seek.toFixed(3), '-i', input],
      [...mapArgs, '-frames:v', '1', '-vf', filter, '-q:v', '3', '-f', 'image2', tmp],
      { ...opts, timeoutMs: 120_000 },
    );
  });

  return out;
}

/**
 * Renditions are produced on demand by HTTP requests, outside the job queue.
 * A project with 60 photos must not fan out into 60 simultaneous decoders, so
 * generation is limited to a couple at a time and identical requests share one
 * in-flight promise.
 */
const RENDITION_CONCURRENCY = 2;
const renditionState = globalSingleton('__photoforge_renditions', () => ({
  inflight: new Map<string, Promise<string>>(),
  active: 0,
  waiters: [] as Array<() => void>,
}));

async function acquireRenditionSlot(): Promise<() => void> {
  if (renditionState.active >= RENDITION_CONCURRENCY) {
    await new Promise<void>((resolve) => renditionState.waiters.push(resolve));
  }
  renditionState.active += 1;
  return () => {
    renditionState.active -= 1;
    renditionState.waiters.shift()?.();
  };
}

/**
 * Photo rendition capped at `max` pixels on the long edge. Returns the original
 * file when it is already a JPEG no larger than the cap.
 */
export async function ensureRendition(item: IndexedItem, max: RenditionSize, opts: FfmpegOptions = {}): Promise<string> {
  if (item.kind !== 'photo') throw new Error('Renditions are only produced for photos');

  const isJpeg = item.ext === 'jpg' || item.ext === 'jpeg';
  const longEdge = Math.max(item.probe?.width ?? Infinity, item.probe?.height ?? Infinity);
  if (isJpeg && longEdge <= max) return item.absPath;

  const out = renditionPath(item.id, max);
  if (await fileExists(out)) return out;

  const existing = renditionState.inflight.get(out);
  if (existing) return existing;

  const task = (async () => {
    const release = await acquireRenditionSlot();
    try {
      if (await fileExists(out)) return out;
      await withAtomicOutput(out, async (tmp) => {
        if (HEIF_EXT.has(item.ext)) {
          await resizeHeifToJpeg(item.absPath, tmp, max, opts);
        } else {
          await resizeWithFfmpeg(item.absPath, tmp, max, opts);
        }
      });
      return out;
    } finally {
      release();
      renditionState.inflight.delete(out);
    }
  })();
  renditionState.inflight.set(out, task);
  return task;
}

export function highlightThumbPath(itemId: string, index: number): string {
  return dataPath('thumbs', `${itemId}-hl-${index}.jpg`);
}

/**
 * Representative frame from a rendered highlight clip (its middle), so the
 * project grid and face detection see the chosen view rather than the clip's
 * generic lens-A thumbnail. Produced on demand and cached; shares the
 * rendition concurrency cap.
 */
export async function ensureHighlightThumb(itemId: string, index: number, clipPath: string, clipDurationSec: number, opts: FfmpegOptions = {}): Promise<string> {
  const out = highlightThumbPath(itemId, index);
  if (await fileExists(out)) return out;
  const existing = renditionState.inflight.get(out);
  if (existing) return existing;

  const task = (async () => {
    const release = await acquireRenditionSlot();
    try {
      if (await fileExists(out)) return out;
      await withAtomicOutput(out, async (tmp) => {
        const seek = Math.max(0, clipDurationSec / 2);
        const size = { width: THUMB_MAX_PX, height: Math.round((THUMB_MAX_PX * 9) / 16) };
        await runFfmpeg(
          ['-ss', seek.toFixed(3), '-i', clipPath],
          ['-frames:v', '1', '-vf', `scale=${size.width}:${size.height},format=yuvj420p`, '-q:v', '3', '-f', 'image2', tmp],
          { ...opts, timeoutMs: 60_000 },
        );
      });
      return out;
    } finally {
      release();
      renditionState.inflight.delete(out);
    }
  })();
  renditionState.inflight.set(out, task);
  return task;
}

/** Pixel dimensions of a produced JPEG (used to reconcile EXIF orientation). */
export async function imageDimensions(filePath: string, signal?: AbortSignal): Promise<{ width: number; height: number } | null> {
  try {
    const out = await runFfprobeJson<{ streams?: Array<{ width?: number; height?: number }> }>(
      ['-show_entries', 'stream=width,height', '-select_streams', 'v:0', filePath],
      { signal },
    );
    const s = out.streams?.[0];
    return s?.width && s?.height ? { width: s.width, height: s.height } : null;
  } catch {
    return null;
  }
}

export function parseRenditionSize(raw: string | null): RenditionSize {
  const n = Number(raw);
  return (RENDITION_SIZES as readonly number[]).includes(n) ? (n as RenditionSize) : 2048;
}
