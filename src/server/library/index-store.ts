/**
 * Per-root item index.
 *
 * One JSON file per root at <appData>/state/index/<rootId>.json, mirrored in
 * memory for fast lookups by item id. Server-only fields (absolute paths) live
 * on IndexedItem and are stripped by `toDto` before anything reaches the browser.
 *
 * Writes are serialised per root and persisted atomically.
 */

import fsp from 'fs/promises';
import { assertServer, dataPath, ensureDataDirs, globalSingleton, readJson, writeJsonAtomic } from '../runtime';
import type { ItemStatus, LibraryItem, ProcessingState } from '@/types/library';

assertServer();

export interface IndexedItem extends LibraryItem {
  /** Real absolute path of the media file. Server-only. */
  absPath: string;
  /** Real absolute path of a camera-generated proxy (.lrv). Server-only. */
  cameraProxyAbsPath?: string;
}

interface IndexFile {
  version: 1;
  rootId: string;
  scannedAt: number;
  items: IndexedItem[];
}

interface StoreState {
  /** rootId → items keyed by item id */
  byRoot: Map<string, Map<string, IndexedItem>>;
  /** rootId → in-flight load */
  loading: Map<string, Promise<void>>;
  /** rootId → write chain, so saves never interleave */
  writeChain: Map<string, Promise<void>>;
}

const state = globalSingleton<StoreState>('__photoforge_index', () => ({
  byRoot: new Map(),
  loading: new Map(),
  writeChain: new Map(),
}));

const indexFile = (rootId: string) => dataPath('state', 'index', `${rootId}.json`);

async function ensureLoaded(rootId: string): Promise<Map<string, IndexedItem>> {
  const cached = state.byRoot.get(rootId);
  if (cached) return cached;

  let pending = state.loading.get(rootId);
  if (!pending) {
    pending = (async () => {
      await ensureDataDirs();
      const file = await readJson<IndexFile | null>(indexFile(rootId), null);
      const map = new Map<string, IndexedItem>();
      for (const item of file?.items ?? []) map.set(item.id, recoverInterrupted(item));
      state.byRoot.set(rootId, map);
    })().finally(() => state.loading.delete(rootId));
    state.loading.set(rootId, pending);
  }
  await pending;
  return state.byRoot.get(rootId)!;
}

/**
 * A step left in 'processing' by a crash or restart is simply pending again.
 * Steps added after an index was written (Phase 2: curate, highlights) start
 * pending so existing libraries pick up the new work without a rescan.
 */
function recoverInterrupted(item: IndexedItem): IndexedItem {
  const status = { ...item.status };
  let changed = false;
  for (const key of Object.keys(status) as (keyof ItemStatus)[]) {
    if (status[key] === 'processing') {
      status[key] = 'pending';
      changed = true;
    }
  }
  if (status.curate === undefined) {
    status.curate = 'pending';
    changed = true;
  }
  if (status.highlights === undefined) {
    status.highlights = item.kind === 'video' && item.is360 ? 'pending' : 'skipped';
    changed = true;
  }
  if (status.pan === undefined) {
    status.pan = item.kind === 'video' && item.is360 ? 'pending' : 'skipped';
    changed = true;
  }
  return changed ? { ...item, status } : item;
}

function persist(rootId: string): Promise<void> {
  const prev = state.writeChain.get(rootId) ?? Promise.resolve();
  const next = prev
    .catch(() => undefined)
    .then(async () => {
      const map = state.byRoot.get(rootId);
      if (!map) return;
      const file: IndexFile = { version: 1, rootId, scannedAt: Date.now(), items: Array.from(map.values()) };
      await writeJsonAtomic(indexFile(rootId), file);
    });
  state.writeChain.set(rootId, next);
  return next;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function getItemsForRoot(rootId: string): Promise<IndexedItem[]> {
  return Array.from((await ensureLoaded(rootId)).values());
}

/** Replace a root's items wholesale (after a scan). Preserves the map identity. */
export async function replaceItems(rootId: string, items: IndexedItem[]): Promise<void> {
  const map = await ensureLoaded(rootId);
  map.clear();
  for (const item of items) map.set(item.id, item);
  await persist(rootId);
}

export async function getItem(rootId: string, itemId: string): Promise<IndexedItem | undefined> {
  return (await ensureLoaded(rootId)).get(itemId);
}

/**
 * Find an item by id across all known roots. Roots not yet loaded in memory are
 * loaded on demand from the ids the caller supplies.
 */
export async function findItem(itemId: string, rootIds: string[]): Promise<IndexedItem | undefined> {
  for (const rootId of rootIds) {
    const found = (await ensureLoaded(rootId)).get(itemId);
    if (found) return found;
  }
  return undefined;
}

/**
 * Phase 7: an item's error message describes a failure; once a step succeeds
 * and no step is failed any more, the message must not linger. Returns what
 * `error` should be after `status` replaced the previous step states.
 */
function settleError(previous: IndexedItem, status: ItemStatus, becameReady: boolean): string | undefined {
  if (!becameReady) return previous.error;
  return Object.values(status).some((s) => s === 'failed') ? previous.error : undefined;
}

/** Apply a partial update to one item and persist. No-op if the item vanished. */
export async function patchItem(rootId: string, itemId: string, patch: Partial<IndexedItem>): Promise<IndexedItem | undefined> {
  const map = await ensureLoaded(rootId);
  const current = map.get(itemId);
  if (!current) return undefined;
  const status: ItemStatus = { ...current.status, ...(patch.status ?? {}) };
  const becameReady = (Object.keys(patch.status ?? {}) as (keyof ItemStatus)[]).some((k) => patch.status![k] === 'ready' && current.status[k] !== 'ready');
  const error = 'error' in patch ? patch.error : settleError(current, status, becameReady);
  const next: IndexedItem = { ...current, ...patch, status, error };
  map.set(itemId, next);
  await persist(rootId);
  return next;
}

export async function setStep(rootId: string, itemId: string, step: keyof ItemStatus, value: ProcessingState, error?: string): Promise<void> {
  const map = await ensureLoaded(rootId);
  const current = map.get(itemId);
  if (!current) return;
  const status: ItemStatus = { ...current.status, [step]: value };
  map.set(itemId, {
    ...current,
    status,
    error: value === 'failed' ? error ?? current.error : settleError(current, status, value === 'ready'),
  });
  await persist(rootId);
}

export async function dropRootIndex(rootId: string): Promise<void> {
  state.byRoot.delete(rootId);
  await fsp.rm(indexFile(rootId), { force: true });
}

/** Strip server-only fields before sending to the browser. */
export function toDto(item: IndexedItem): LibraryItem {
  // Destructure to drop absolute paths; keep everything else as-is.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { absPath, cameraProxyAbsPath, ...dto } = item;
  return dto;
}
