/**
 * Registry of library roots — the only folders the server may read.
 *
 * Persisted at <appData>/state/roots.json. Removing a root forgets it and its
 * index; it never touches the user's files.
 */

import crypto from 'crypto';
import path from 'path';
import { assertServer, dataPath, ensureDataDirs, globalSingleton, readJson, writeJsonAtomic } from '../runtime';
import { validateRootCandidate } from '../fs/safe-path';
import type { LibraryRoot } from '@/types/library';

assertServer();

interface RootsFile {
  version: 1;
  roots: LibraryRoot[];
}

const ROOTS_FILE = () => dataPath('state', 'roots.json');

interface RegistryState {
  loaded: Promise<LibraryRoot[]> | null;
}

const state = globalSingleton<RegistryState>('__photoforge_registry', () => ({ loaded: null }));

async function load(): Promise<LibraryRoot[]> {
  if (!state.loaded) {
    state.loaded = (async () => {
      await ensureDataDirs();
      const file = await readJson<RootsFile | null>(ROOTS_FILE(), null);
      return file?.roots ?? [];
    })();
  }
  return state.loaded;
}

async function persist(roots: LibraryRoot[]): Promise<void> {
  state.loaded = Promise.resolve(roots);
  await writeJsonAtomic(ROOTS_FILE(), { version: 1, roots } satisfies RootsFile);
}

export function rootIdFor(realPath: string): string {
  return crypto.createHash('sha1').update(realPath).digest('hex').slice(0, 12);
}

export async function listRoots(): Promise<LibraryRoot[]> {
  return [...(await load())].sort((a, b) => a.addedAt - b.addedAt);
}

export async function getRoot(id: string): Promise<LibraryRoot | undefined> {
  return (await load()).find((r) => r.id === id);
}

/**
 * Register a folder. Idempotent: registering the same real path twice returns
 * the existing root. Nested roots are rejected to keep item identity unique.
 */
export async function addRoot(inputPath: string): Promise<{ root: LibraryRoot; created: boolean }> {
  const real = await validateRootCandidate(inputPath);
  const roots = await load();

  const existing = roots.find((r) => r.path === real);
  if (existing) return { root: existing, created: false };

  const overlapping = roots.find((r) => real.startsWith(r.path + path.sep) || r.path.startsWith(real + path.sep));
  if (overlapping) {
    throw new Error(`That folder overlaps an existing library (${overlapping.path}). Remove one first.`);
  }

  const root: LibraryRoot = {
    id: rootIdFor(real),
    path: real,
    label: path.basename(real) || real,
    addedAt: Date.now(),
    itemCount: 0,
  };
  await persist([...roots, root]);
  return { root, created: true };
}

export async function updateRoot(id: string, patch: Partial<Pick<LibraryRoot, 'itemCount' | 'lastScanAt'>>): Promise<void> {
  const roots = await load();
  const idx = roots.findIndex((r) => r.id === id);
  if (idx === -1) return;
  const next = [...roots];
  next[idx] = { ...next[idx], ...patch };
  await persist(next);
}

export async function removeRoot(id: string): Promise<boolean> {
  const roots = await load();
  const next = roots.filter((r) => r.id !== id);
  if (next.length === roots.length) return false;
  await persist(next);
  return true;
}
