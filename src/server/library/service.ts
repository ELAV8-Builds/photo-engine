/**
 * Library service — the façade API routes talk to.
 *
 * Owns process bootstrap (handler registration + resuming outstanding work),
 * root lifecycle, and read queries. Routes stay thin: parse, call, respond.
 */

import { assertServer, ensureDataDirs, globalSingleton } from '../runtime';
import { createLogger } from '../log';
import { sweepStaleArtifacts } from '../maintenance';
import { cancelWhere, enqueue, PRIORITY } from '../jobs/queue';
import { registerAllHandlers } from '../jobs/handlers';
import { startThermalWatchdog } from '../jobs/thermal';
import { hasModel, ollamaHealth, OllamaUnavailableError } from '../ai/ollama';
import { getSettings } from '../settings/store';
import { loadCuration, removeCuration, removeHighlightArtifacts, saveCuration } from '../curation/record';
import { selectForMontage, type SelectOptions } from '../curation/select';
import { buildStoryContext, defaultKeys, type ContextSource } from '../story/context';
import { generateStoryPlan, loadStoryPlan, saveStoryPlan } from '../story/generate';
import { heuristicStoryPlan } from '../story/heuristic';
import { createProvider } from '../ai';
import type { ProviderChoice } from '../ai/provider';
import { addRoot, getRoot, listRoots, removeRoot } from './registry';
import { dropRootIndex, findItem, getItemsForRoot, patchItem, toDto, type IndexedItem } from './index-store';
import { enqueueItemWork, planItemJobs } from './work';
import type { CurationRecord, LibraryItem, LibraryItemsPage, LibraryRoot, MediaKind, MontagePick, StoryPlan } from '@/types/library';

assertServer();

const log = createLogger('library');

interface BootState {
  ready: Promise<void> | null;
}

const boot = globalSingleton<BootState>('__photoforge_boot', () => ({ ready: null }));

/**
 * Idempotent process bootstrap. Registers handlers (replacing on hot reload)
 * and re-enqueues any work the index says is still pending — the crash/restart
 * recovery path.
 */
export function ensureBootstrapped(): Promise<void> {
  registerAllHandlers();
  if (!boot.ready) {
    boot.ready = (async () => {
      await ensureDataDirs();
      await sweepStaleArtifacts();
      startThermalWatchdog();
      // Without a reachable model there is no point queueing curation; the
      // Analyse button (or the next boot) picks it up once Ollama is running.
      const modelReady = await visionModelReady();
      const roots = await listRoots();
      let resumed = 0;
      let deferred = 0;
      for (const root of roots) {
        for (const item of await getItemsForRoot(root.id)) {
          for (const job of planItemJobs(item)) {
            if (job.type === 'curate' && !modelReady) {
              deferred += 1;
              continue;
            }
            enqueue(job);
            resumed += 1;
          }
        }
      }
      if (resumed > 0) log.info(`resumed ${resumed} pending job(s) across ${roots.length} root(s)`);
      if (deferred > 0) log.info(`deferred ${deferred} curation job(s): vision model not available`);
    })().catch((err) => {
      boot.ready = null; // allow retry on next request
      throw err;
    });
  }
  return boot.ready;
}

// ---------------------------------------------------------------------------
// Roots
// ---------------------------------------------------------------------------

export async function getRoots(): Promise<LibraryRoot[]> {
  await ensureBootstrapped();
  return listRoots();
}

export async function registerRoot(inputPath: string, label?: string): Promise<{ root: LibraryRoot; created: boolean }> {
  await ensureBootstrapped();
  const result = await addRoot(inputPath, label);
  enqueue({ type: 'scan-root', lane: 'io', priority: PRIORITY.scan, rootId: result.root.id });
  log.info(result.created ? 'root added' : 'root already registered; rescanning', { path: result.root.path });
  return result;
}

export async function rescanRoot(rootId: string): Promise<boolean> {
  await ensureBootstrapped();
  if (!(await getRoot(rootId))) return false;
  enqueue({ type: 'scan-root', lane: 'io', priority: PRIORITY.scan, rootId });
  return true;
}

/** Forget a root: stop its jobs, drop its index. The user's files are untouched. */
export async function unregisterRoot(rootId: string): Promise<boolean> {
  await ensureBootstrapped();
  const cancelled = cancelWhere((j) => j.rootId === rootId);
  const removed = await removeRoot(rootId);
  if (removed) {
    await dropRootIndex(rootId);
    log.info('root removed', { rootId, cancelledJobs: cancelled });
  }
  return removed;
}

// ---------------------------------------------------------------------------
// Items
// ---------------------------------------------------------------------------

export interface ListItemsQuery {
  rootId?: string;
  kind?: MediaKind;
  offset?: number;
  limit?: number;
}

export async function listItems(query: ListItemsQuery = {}): Promise<LibraryItemsPage> {
  await ensureBootstrapped();
  const roots = query.rootId ? [await getRoot(query.rootId)].filter(Boolean) as LibraryRoot[] : await listRoots();

  let all: IndexedItem[] = [];
  for (const root of roots) all = all.concat(await getItemsForRoot(root.id));
  if (query.kind) all = all.filter((i) => i.kind === query.kind);
  all.sort((a, b) => (a.capturedAt ?? a.mtimeMs) - (b.capturedAt ?? b.mtimeMs) || a.relPath.localeCompare(b.relPath));

  const offset = Math.max(0, query.offset ?? 0);
  const limit = Math.min(2000, Math.max(1, query.limit ?? 500));
  return { items: all.slice(offset, offset + limit).map(toDto), total: all.length, offset, limit };
}

/** Resolve an item id to its full server record (with paths). Undefined when unknown. */
export async function resolveItem(itemId: string): Promise<IndexedItem | undefined> {
  await ensureBootstrapped();
  if (!/^[a-f0-9]{20}$/.test(itemId)) return undefined;
  const roots = await listRoots();
  return findItem(itemId, roots.map((r) => r.id));
}

export async function getItemDto(itemId: string): Promise<LibraryItem | undefined> {
  const item = await resolveItem(itemId);
  return item ? toDto(item) : undefined;
}

// ---------------------------------------------------------------------------
// Curation
// ---------------------------------------------------------------------------

async function visionModelReady(): Promise<boolean> {
  const [health, settings] = await Promise.all([ollamaHealth(), getSettings()]);
  return health.running && hasModel(health.models, settings.visionModel);
}

async function requireVisionModel(): Promise<void> {
  const [health, settings] = await Promise.all([ollamaHealth(), getSettings()]);
  if (!health.running) throw new OllamaUnavailableError('Ollama is not running on this Mac. Start it, then try again.');
  if (!hasModel(health.models, settings.visionModel)) {
    throw new OllamaUnavailableError(`Model "${settings.visionModel}" is not pulled. Run: ollama pull ${settings.visionModel}`);
  }
}

export interface AnalyseOptions {
  /** Restrict to these items; default every item in every root. */
  itemIds?: string[];
  /** Discard existing records and grade again. */
  force?: boolean;
  /** Backend for the queued grading (Phase 4). Defaults to local. */
  provider?: ProviderChoice;
}

/**
 * Queue curation for items without a record (or all given items when forced).
 * Items whose inputs are not ready yet are set pending and picked up by the
 * usual planner when those inputs land.
 */
export async function analyseItems(opts: AnalyseOptions = {}): Promise<{ enqueued: number; skipped: number }> {
  await ensureBootstrapped();
  const kind = opts.provider?.kind ?? 'local';
  if (kind === 'local') await requireVisionModel();

  const wanted = opts.itemIds ? new Set(opts.itemIds) : null;
  let enqueued = 0;
  let skipped = 0;
  for (const root of await listRoots()) {
    for (const item of await getItemsForRoot(root.id)) {
      if (wanted && !wanted.has(item.id)) continue;
      if (item.status.probe === 'failed') {
        skipped += 1;
        continue;
      }
      const needs = opts.force || item.status.curate !== 'ready';
      if (!needs) {
        skipped += 1;
        continue;
      }
      if (opts.force) {
        await removeCuration(item.id);
        cancelWhere((j) => j.itemId === item.id && (j.type === 'curate' || j.type === 'highlights'));
      }
      const patched = await patchItem(root.id, item.id, {
        curation: undefined,
        status: {
          ...item.status,
          curate: 'pending',
          highlights: item.kind === 'video' && item.is360 ? 'pending' : 'skipped',
          pan: item.kind === 'video' && item.is360 ? 'pending' : 'skipped',
        },
      });
      if (patched) enqueued += enqueueItemWork(patched, { provider: kind });
    }
  }
  return { enqueued, skipped };
}

export async function getCurationRecord(itemId: string): Promise<CurationRecord | null> {
  const item = await resolveItem(itemId);
  if (!item) return null;
  return loadCuration(item.id);
}

/**
 * Phase 5: a hand-chosen view for one 360 highlight. Rendered clips for that
 * window are dropped and queued again; the view becomes `source: 'user'` and
 * its version bumps so the browser re-fetches. Returns the updated window.
 */
export async function setHighlightView(
  itemId: string,
  index: number,
  view: { lens: 'a' | 'b'; yawDeg: number; pitchDeg: number },
): Promise<{ highlight: CurationRecord['highlights'][number] } | null> {
  await ensureBootstrapped();
  const item = await resolveItem(itemId);
  if (!item || item.kind !== 'video' || !item.is360) return null;
  const record = await loadCuration(item.id);
  const h = record?.highlights.find((w) => w.index === index);
  if (!record || !h) return null;

  cancelWhere((j) => j.itemId === item.id && (j.type === 'highlights' || j.type === 'pan360'));
  h.view = { ...view, source: 'user', version: (h.view?.version ?? 0) + 1 };
  // A hand-set view is static: no pan; the planet clip does not depend on the view.
  h.viewPath = [{ t: h.start, yawDeg: view.yawDeg, pitchDeg: view.pitchDeg }];
  h.panProxy = undefined;
  h.proxy = 'pending';
  await removeHighlightArtifacts(item.id, h.index);
  h.planetProxy = 'pending'; // removed with the other artefacts; cheap to redo from the .lrv
  await saveCuration(record);

  const patched = await patchItem(item.rootId, item.id, { status: { ...item.status, highlights: 'pending' } });
  if (patched) enqueueItemWork(patched);
  log.info('highlight view set by user', { item: item.name, index, lens: view.lens, yaw: view.yawDeg, pitch: view.pitchDeg });
  return { highlight: h };
}

/** Every curated item (DTO) with its record, across all roots. */
async function curatedSources(): Promise<Map<string, ContextSource>> {
  const out = new Map<string, ContextSource>();
  for (const root of await listRoots()) {
    for (const item of await getItemsForRoot(root.id)) {
      if (item.status.curate !== 'ready') continue;
      const record = await loadCuration(item.id);
      if (record) out.set(item.id, { item: toDto(item), record });
    }
  }
  return out;
}

/** Build a montage plan across every root from the current curation records. */
export async function planMontage(opts: SelectOptions): Promise<{ picks: MontagePick[]; considered: number }> {
  await ensureBootstrapped();
  const sources = await curatedSources();
  const records = new Map<string, CurationRecord>();
  const items: LibraryItem[] = [];
  sources.forEach(({ item, record }, id) => {
    records.set(id, record);
    items.push(item);
  });
  return { picks: selectForMontage(items, records, opts), considered: items.length };
}

// ---------------------------------------------------------------------------
// Story
// ---------------------------------------------------------------------------

export interface StoryOptions {
  /** Shots in project order (`itemId` or `itemId#n`). Defaults to every curated shot by time. */
  keys?: string[];
  /** Ignore the cached plan for this shot list. */
  force?: boolean;
  /** Backend for the model pass (Phase 4). Defaults to local. */
  provider?: ProviderChoice;
}

/**
 * Story plan for a shot list: cached per list, model-written when the chosen
 * backend is available, heuristic otherwise. Runs under the shared inference
 * lock so it interleaves with (never overlaps) background grading.
 */
export async function planStory(opts: StoryOptions = {}): Promise<{ plan: StoryPlan; cached: boolean }> {
  await ensureBootstrapped();
  const sources = await curatedSources();
  const keys = opts.keys && opts.keys.length > 0 ? opts.keys : defaultKeys(sources);
  const ctx = buildStoryContext(keys, sources);
  if (ctx.entries.length === 0) return { plan: heuristicStoryPlan(ctx), cached: false };

  if (!opts.force) {
    const cached = await loadStoryPlan(ctx.entries.map((e) => e.key));
    if (cached) return { plan: cached, cached: true };
  }

  const choice: ProviderChoice = opts.provider ?? { kind: 'local' };
  const modelReady = choice.kind === 'local' ? await visionModelReady() : true;
  const plan = modelReady
    ? await generateStoryPlan(ctx, { provider: createProvider(choice, (await getSettings()).visionModel) })
    : heuristicStoryPlan(ctx);
  if (!modelReady) log.info('story: model unavailable, heuristic plan', { shots: ctx.entries.length });
  await saveStoryPlan(plan);
  return { plan, cached: false };
}

/** Prove a cloud key works with one tiny call. Throws ProviderUnavailableError (→ 503) when it does not. */
export async function testProvider(choice: ProviderChoice): Promise<{ ok: true; provider: string; model: string }> {
  const provider = createProvider(choice, (await getSettings()).visionModel);
  if (choice.kind === 'local') await requireVisionModel();
  else if (provider.ping) await provider.ping(AbortSignal.timeout(30_000));
  return { ok: true, provider: provider.name, model: provider.model };
}
