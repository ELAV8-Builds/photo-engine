/**
 * Job handlers — the only place that mutates item status.
 *
 * Each handler:
 *   1. marks its step 'processing',
 *   2. does the work under the active performance budget,
 *   3. marks 'ready' (or 'failed' with a short message),
 *   4. enqueues whatever the item still needs.
 *
 * Handlers are idempotent: re-running one on an already-ready item is cheap
 * because artefacts are cached by item id.
 */

import fsp from 'fs/promises';
import { assertServer, dataPath, fileExists } from '../runtime';
import { createLogger, errorMessage } from '../log';
import { budgetFor, getSettings } from '../settings/store';
import { getRoot, updateRoot } from '../library/registry';
import { getItem, getItemsForRoot, patchItem, replaceItems, setStep, type IndexedItem } from '../library/index-store';
import { scanRoot } from '../library/scanner';
import { enqueueItemWork } from '../library/work';
import { probeCaptureTime, probeMedia } from '../media/probe';
import { generateThumbnail, imageDimensions, proxyPath } from '../media/thumbnails';
import { renderFlatProxy } from '../media/reframe';
import { extractSignals } from '../analysis/signals';
import { registerHandler, type JobContext } from './queue';
import type { JobInfo } from '@/types/library';

assertServer();

const log = createLogger('handlers');

async function requireItem(job: JobInfo): Promise<IndexedItem> {
  if (!job.rootId || !job.itemId) throw new Error('Job is missing rootId/itemId');
  const item = await getItem(job.rootId, job.itemId);
  if (!item) throw new Error('Item no longer exists in the index');
  if (!(await fileExists(item.absPath))) throw new Error('Media file is no longer readable (drive unmounted?)');
  return item;
}

async function activeBudget() {
  const settings = await getSettings();
  return budgetFor(settings.performanceProfile);
}

// ---------------------------------------------------------------------------
// scan-root
// ---------------------------------------------------------------------------

async function handleScanRoot(job: JobInfo): Promise<void> {
  if (!job.rootId) throw new Error('scan-root requires rootId');
  const root = await getRoot(job.rootId);
  if (!root) throw new Error('Root was removed');

  const previous = await getItemsForRoot(root.id);
  const result = await scanRoot(root.id, root.path, previous);
  await replaceItems(root.id, result.items);
  await updateRoot(root.id, { itemCount: result.items.length, lastScanAt: Date.now() });

  let enqueued = 0;
  for (const item of result.items) enqueued += enqueueItemWork(item);
  log.info(`scanned ${root.label}`, { items: result.items.length, enqueued, skippedDirs: result.skippedDirs, ms: result.durationMs });
}

// ---------------------------------------------------------------------------
// prepare: probe + capture time + thumbnail
// ---------------------------------------------------------------------------

async function handlePrepare(job: JobInfo, ctx: JobContext): Promise<void> {
  let item = await requireItem(job);
  const budget = await activeBudget();
  const rootId = item.rootId;

  if (item.status.probe !== 'ready') {
    await setStep(rootId, item.id, 'probe', 'processing');
    try {
      const probe = await probeMedia(item, ctx.signal);
      const capturedAt = item.capturedAt ?? (await probeCaptureTime(item, ctx.signal)) ?? item.mtimeMs;
      item = (await patchItem(rootId, item.id, { probe, capturedAt, status: { ...item.status, probe: 'ready' } })) ?? item;
    } catch (err) {
      await setStep(rootId, item.id, 'probe', 'failed', errorMessage(err));
      // Without a probe nothing downstream can run; mark the rest skipped.
      await patchItem(rootId, item.id, { status: { ...item.status, probe: 'failed', thumb: 'failed', proxy360: 'skipped', signals: 'skipped' } });
      throw err;
    }
  }
  ctx.report(0.5);

  if (item.status.thumb !== 'ready') {
    await setStep(rootId, item.id, 'thumb', 'processing');
    try {
      const thumb = await generateThumbnail(item, { signal: ctx.signal, nice: budget.nice, threads: budget.threads });
      const probe = await reconcileOrientation(item, thumb, ctx.signal);
      await patchItem(rootId, item.id, { probe, status: { ...item.status, probe: 'ready', thumb: 'ready' } });
    } catch (err) {
      await setStep(rootId, item.id, 'thumb', 'failed', errorMessage(err));
      throw err;
    }
  }
  ctx.report(1);

  const fresh = await getItem(rootId, item.id);
  if (fresh) enqueueItemWork(fresh);
}

/**
 * Photo containers report stored pixel dimensions, but EXIF orientation can
 * rotate the picture 90°. Our thumbnails are always rendered upright, so if the
 * thumbnail's aspect is transposed relative to the probe, swap width/height.
 * This keeps face coordinates and hold-points aligned with what the browser draws.
 */
async function reconcileOrientation(item: IndexedItem, thumbPath: string, signal: AbortSignal) {
  const probe = item.probe;
  if (!probe || item.kind !== 'photo') return probe;
  const dims = await imageDimensions(thumbPath, signal);
  if (!dims || dims.width === dims.height || probe.width === probe.height) return probe;
  const thumbLandscape = dims.width > dims.height;
  const probeLandscape = probe.width > probe.height;
  return thumbLandscape === probeLandscape ? probe : { ...probe, width: probe.height, height: probe.width };
}

// ---------------------------------------------------------------------------
// proxy360: flat browser-playable preview
// ---------------------------------------------------------------------------

async function handleProxy360(job: JobInfo, ctx: JobContext): Promise<void> {
  const item = await requireItem(job);
  const budget = await activeBudget();
  const out = proxyPath(item.id);

  if (await fileExists(out)) {
    await setStep(item.rootId, item.id, 'proxy360', 'ready');
    return;
  }

  await setStep(item.rootId, item.id, 'proxy360', 'processing');
  const tmp = `${out}.${process.pid}.tmp.mp4`;
  try {
    const useCameraProxy = !!item.cameraProxyAbsPath && (await fileExists(item.cameraProxyAbsPath));
    await renderFlatProxy(useCameraProxy ? item.cameraProxyAbsPath! : item.absPath, tmp, {
      layout: useCameraProxy ? 'dual-fisheye-sbs' : item.layout,
      hasAudio: item.probe?.hasAudio ?? false,
      sourceDurationSec: item.probe?.durationSec,
      signal: ctx.signal,
      nice: budget.nice,
      threads: budget.threads,
      onProgress: ctx.report,
      timeoutMs: 6 * 60 * 60_000,
    });
    await fsp.rename(tmp, out);
    await setStep(item.rootId, item.id, 'proxy360', 'ready');
  } catch (err) {
    await fsp.rm(tmp, { force: true });
    await setStep(item.rootId, item.id, 'proxy360', ctx.signal.aborted ? 'pending' : 'failed', errorMessage(err));
    throw err;
  }
}

// ---------------------------------------------------------------------------
// signals: Stage-1 measurements
// ---------------------------------------------------------------------------

async function handleSignals(job: JobInfo, ctx: JobContext): Promise<void> {
  const item = await requireItem(job);
  const budget = await activeBudget();
  const tmpDir = dataPath('tmp', job.id);

  await setStep(item.rootId, item.id, 'signals', 'processing');
  try {
    await extractSignals(item, {
      sampleFps: budget.signalFps,
      tmpDir,
      signal: ctx.signal,
      nice: budget.nice,
      threads: budget.threads,
      onProgress: ctx.report,
    });
    await setStep(item.rootId, item.id, 'signals', 'ready');
  } catch (err) {
    await setStep(item.rootId, item.id, 'signals', ctx.signal.aborted ? 'pending' : 'failed', errorMessage(err));
    throw err;
  } finally {
    await fsp.rm(tmpDir, { recursive: true, force: true });
  }
}

// ---------------------------------------------------------------------------

export function registerAllHandlers(): void {
  registerHandler('scan-root', handleScanRoot);
  registerHandler('prepare', handlePrepare);
  registerHandler('proxy360', handleProxy360);
  registerHandler('signals', handleSignals);
}
