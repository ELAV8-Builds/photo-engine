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
import { addRoot, getRoot, listRoots, removeRoot } from './registry';
import { dropRootIndex, findItem, getItemsForRoot, toDto, type IndexedItem } from './index-store';
import { enqueueItemWork } from './work';
import type { LibraryItem, LibraryItemsPage, LibraryRoot, MediaKind } from '@/types/library';

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
      const roots = await listRoots();
      let resumed = 0;
      for (const root of roots) {
        for (const item of await getItemsForRoot(root.id)) resumed += enqueueItemWork(item);
      }
      if (resumed > 0) log.info(`resumed ${resumed} pending job(s) across ${roots.length} root(s)`);
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

export async function registerRoot(inputPath: string): Promise<{ root: LibraryRoot; created: boolean }> {
  await ensureBootstrapped();
  const result = await addRoot(inputPath);
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
