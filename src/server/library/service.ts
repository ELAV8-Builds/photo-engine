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
import { loadCuration, removeCuration } from '../curation/record';
import { selectForMontage, type SelectOptions } from '../curation/select';
import { addRoot, getRoot, listRoots, removeRoot } from './registry';
import { dropRootIndex, findItem, getItemsForRoot, patchItem, toDto, type IndexedItem } from './index-store';
import { enqueueItemWork, planItemJobs } from './work';
import type { CurationRecord, LibraryItem, LibraryItemsPage, LibraryRoot, MediaKind, MontagePick } from '@/types/library';

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
}

/**
 * Queue curation for items without a record (or all given items when forced).
 * Items whose inputs are not ready yet are set pending and picked up by the
 * usual planner when those inputs land.
 */
export async function analyseItems(opts: AnalyseOptions = {}): Promise<{ enqueued: number; skipped: number }> {
  await ensureBootstrapped();
  await requireVisionModel();

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
        status: { ...item.status, curate: 'pending', highlights: item.kind === 'video' && item.is360 ? 'pending' : 'skipped' },
      });
      if (patched) enqueued += enqueueItemWork(patched);
    }
  }
  return { enqueued, skipped };
}

export async function getCurationRecord(itemId: string): Promise<CurationRecord | null> {
  const item = await resolveItem(itemId);
  if (!item) return null;
  return loadCuration(item.id);
}

/** Build a montage plan across every root from the current curation records. */
export async function planMontage(opts: SelectOptions): Promise<{ picks: MontagePick[]; considered: number }> {
  await ensureBootstrapped();
  const records = new Map<string, CurationRecord>();
  const items: LibraryItem[] = [];
  for (const root of await listRoots()) {
    for (const item of await getItemsForRoot(root.id)) {
      if (item.status.curate !== 'ready') continue;
      const rec = await loadCuration(item.id);
      if (!rec) continue;
      records.set(item.id, rec);
      items.push(toDto(item));
    }
  }
  return { picks: selectForMontage(items, records, opts), considered: items.length };
}
