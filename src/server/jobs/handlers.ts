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
import { generateThumbnail, imageDimensions, proxyPath, thumbPath } from '../media/thumbnails';
import { renderFlatProxy } from '../media/reframe';
import { extractSignals, loadSignals } from '../analysis/signals';
import { curatePhoto, curateVideo } from '../analysis/highlights';
import { hasModel, ollamaHealth, OllamaUnavailableError } from '../ai/ollama';
import { createProviderForKind } from '../ai';
import { ProviderUnavailableError, type VisionProvider } from '../ai/provider';
import { highlightProxyPath, loadCuration, saveCuration, summarize } from '../curation/record';
import { cancelWhere, registerHandler, type JobContext } from './queue';
import type { CurationRecord, JobInfo } from '@/types/library';

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
      await patchItem(rootId, item.id, {
        status: { ...item.status, probe: 'failed', thumb: 'failed', proxy360: 'skipped', signals: 'skipped', curate: 'skipped', highlights: 'skipped' },
      });
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

  // Curation waits for signals; now it can be planned.
  const fresh = await getItem(item.rootId, item.id);
  if (fresh) enqueueItemWork(fresh);
}

// ---------------------------------------------------------------------------
// curate: Stage-2 local vision-model grading (model lane)
// ---------------------------------------------------------------------------

async function handleCurate(job: JobInfo, ctx: JobContext): Promise<void> {
  const item = await requireItem(job);
  const budget = await activeBudget();
  const settings = await getSettings();
  const tmpDir = dataPath('tmp', job.id);

  // A dead model server must not turn 40 queued items into 40 failures: drop
  // the rest of the lane (same backend) and leave everything pending for the next attempt.
  const sameBackend = (j: JobInfo) => j.type === 'curate' && j.id !== job.id && (j.provider ?? 'local') === (job.provider ?? 'local');
  if ((job.provider ?? 'local') === 'local') {
    const health = await ollamaHealth();
    if (!health.running || !hasModel(health.models, settings.visionModel)) {
      const reason = !health.running
        ? 'Ollama is not running (start Ollama, then Analyse again)'
        : `Model "${settings.visionModel}" is not pulled (ollama pull ${settings.visionModel})`;
      cancelWhere(sameBackend);
      await setStep(item.rootId, item.id, 'curate', 'pending');
      throw new OllamaUnavailableError(reason);
    }
  }

  let provider: VisionProvider;
  try {
    provider = createProviderForKind(job.provider, settings.visionModel);
  } catch (err) {
    // Cloud session gone: nothing to grade with; keep the whole batch pending.
    cancelWhere(sameBackend);
    await setStep(item.rootId, item.id, 'curate', 'pending');
    throw err;
  }

  await setStep(item.rootId, item.id, 'curate', 'processing');
  try {
    let record: CurationRecord;
    if (item.kind === 'photo') {
      const thumb = thumbPath(item.id);
      if (!(await fileExists(thumb))) throw new Error('Thumbnail is not ready yet');
      record = await curatePhoto(item, thumb, { provider, tmpDir, signal: ctx.signal, nice: budget.nice, threads: budget.threads });
    } else {
      const track = await loadSignals(item.id);
      if (!track) throw new Error('Stage-1 signals are missing; rerun the scan');
      record = await curateVideo(item, track, {
        provider,
        tmpDir,
        signal: ctx.signal,
        nice: budget.nice,
        threads: budget.threads,
        onProgress: ctx.report,
      });
    }
    await saveCuration(record);
    const needsProxies = record.highlights.some((h) => h.proxy === 'pending');
    await patchItem(item.rootId, item.id, {
      curation: summarize(record),
      status: { ...item.status, curate: 'ready', highlights: needsProxies ? 'pending' : 'skipped' },
    });
  } catch (err) {
    // Cancelled or model gone: stay pending so a later run resumes from the partial file.
    const transient = ctx.signal.aborted || err instanceof ProviderUnavailableError;
    await setStep(item.rootId, item.id, 'curate', transient ? 'pending' : 'failed', errorMessage(err));
    if (err instanceof ProviderUnavailableError) cancelWhere(sameBackend);
    throw err;
  } finally {
    await fsp.rm(tmpDir, { recursive: true, force: true });
  }

  const fresh = await getItem(item.rootId, item.id);
  if (fresh) enqueueItemWork(fresh);
}

// ---------------------------------------------------------------------------
// highlights: flat 1080p clips for each 360 highlight window (ffmpeg lane)
// ---------------------------------------------------------------------------

const HIGHLIGHT_MARGIN_SEC = 0.5;

async function handleHighlights(job: JobInfo, ctx: JobContext): Promise<void> {
  const item = await requireItem(job);
  const budget = await activeBudget();
  const record = await loadCuration(item.id);
  if (!record) throw new Error('No curation record; run Analyse first');

  await setStep(item.rootId, item.id, 'highlights', 'processing');
  const pending = record.highlights.filter((h) => h.proxy !== 'ready');
  let failed = 0;

  for (let i = 0; i < pending.length; i++) {
    if (ctx.signal.aborted) break;
    const h = pending[i];
    const out = highlightProxyPath(item.id, h.index);
    if (await fileExists(out)) {
      h.proxy = 'ready';
      continue;
    }
    const start = Math.max(0, h.start - HIGHLIGHT_MARGIN_SEC);
    const duration = Math.min((item.probe?.durationSec ?? h.end) - start, h.end - h.start + 2 * HIGHLIGHT_MARGIN_SEC);
    const tmp = `${out}.${process.pid}.tmp.mp4`;
    try {
      await renderFlatProxy(item.absPath, tmp, {
        layout: item.layout,
        lens: h.view?.lens ?? 'a',
        view: { yawDeg: h.view?.yawDeg ?? 0, pitchDeg: h.view?.pitchDeg ?? 0, hFovDeg: 100, vFovDeg: 70 },
        size: { width: 1920, height: 1080 },
        bitrate: '12M',
        trimStartSec: start,
        trimDurationSec: duration,
        hasAudio: item.probe?.hasAudio ?? false,
        signal: ctx.signal,
        nice: budget.nice,
        threads: budget.threads,
        onProgress: (p) => ctx.report((i + p) / pending.length),
        timeoutMs: 30 * 60_000,
      });
      await fsp.rename(tmp, out);
      h.proxy = 'ready';
    } catch (err) {
      await fsp.rm(tmp, { force: true });
      if (ctx.signal.aborted) break;
      failed += 1;
      h.proxy = 'failed';
      log.warn('highlight proxy failed', { item: item.name, index: h.index, error: errorMessage(err) });
    }
    await saveCuration(record);
  }

  await saveCuration(record);
  const state = ctx.signal.aborted ? 'pending' : failed > 0 && failed === pending.length ? 'failed' : 'ready';
  await setStep(item.rootId, item.id, 'highlights', state, failed > 0 ? `${failed} highlight clip(s) failed to render` : undefined);
  if (ctx.signal.aborted) throw new Error('Cancelled');
}

// ---------------------------------------------------------------------------

export function registerAllHandlers(): void {
  registerHandler('scan-root', handleScanRoot);
  registerHandler('prepare', handlePrepare);
  registerHandler('proxy360', handleProxy360);
  registerHandler('signals', handleSignals);
  registerHandler('curate', handleCurate);
  registerHandler('highlights', handleHighlights);
}
