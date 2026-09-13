/**
 * Server runtime basics: server-only guard, application data directory,
 * and atomic JSON persistence.
 *
 * Every module under src/server imports `assertServer` (directly or via this
 * file) so an accidental client-side import fails loudly instead of leaking
 * Node APIs into the bundle.
 */

import fs from 'fs';
import fsp from 'fs/promises';
import os from 'os';
import path from 'path';

export function assertServer(): void {
  if (typeof window !== 'undefined') {
    throw new Error('[PhotoForge] server-only module imported in the browser');
  }
}

assertServer();

// ---------------------------------------------------------------------------
// Application data directory
// ---------------------------------------------------------------------------

/**
 * Where PhotoForge keeps its own state and caches. Never inside the user's
 * media folders and never inside the repository.
 *
 * macOS:  ~/Library/Application Support/PhotoForge
 * other:  $XDG_DATA_HOME/photoforge or ~/.photoforge
 *
 * Override with PHOTOFORGE_DATA_DIR (useful for tests).
 */
export function appDataDir(): string {
  const override = process.env.PHOTOFORGE_DATA_DIR;
  if (override && override.trim()) return path.resolve(override);

  const home = os.homedir();
  if (process.platform === 'darwin') {
    return path.join(home, 'Library', 'Application Support', 'PhotoForge');
  }
  const xdg = process.env.XDG_DATA_HOME;
  return xdg ? path.join(xdg, 'photoforge') : path.join(home, '.photoforge');
}

export const DATA_SUBDIRS = {
  state: 'state',
  thumbs: path.join('cache', 'thumbs'),
  renditions: path.join('cache', 'renditions'),
  proxies: path.join('cache', 'proxies'),
  analysis: path.join('cache', 'analysis'),
  tmp: 'tmp',
  logs: 'logs',
} as const;

export type DataSubdir = keyof typeof DATA_SUBDIRS;

export function dataPath(subdir: DataSubdir, ...segments: string[]): string {
  return path.join(appDataDir(), DATA_SUBDIRS[subdir], ...segments);
}

let dirsReady: Promise<void> | null = null;

/** Create the data directory tree once per process. Safe to call repeatedly. */
export function ensureDataDirs(): Promise<void> {
  if (!dirsReady) {
    dirsReady = (async () => {
      for (const sub of Object.values(DATA_SUBDIRS)) {
        await fsp.mkdir(path.join(appDataDir(), sub), { recursive: true, mode: 0o700 });
      }
    })();
  }
  return dirsReady;
}

// ---------------------------------------------------------------------------
// Atomic JSON persistence
// ---------------------------------------------------------------------------

/**
 * Write JSON via a sibling temp file + rename so readers never observe a
 * half-written file, even if the process dies mid-write.
 */
export async function writeJsonAtomic(filePath: string, value: unknown): Promise<void> {
  await fsp.mkdir(path.dirname(filePath), { recursive: true });
  const tmp = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  const json = JSON.stringify(value, null, 2);
  await fsp.writeFile(tmp, json, { encoding: 'utf8', mode: 0o600 });
  await fsp.rename(tmp, filePath);
}

export async function readJson<T>(filePath: string, fallback: T): Promise<T> {
  try {
    const raw = await fsp.readFile(filePath, 'utf8');
    return JSON.parse(raw) as T;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return fallback;
    throw err;
  }
}

export function fileExistsSync(p: string): boolean {
  try {
    fs.accessSync(p, fs.constants.R_OK);
    return true;
  } catch {
    return false;
  }
}

export async function fileExists(p: string): Promise<boolean> {
  try {
    await fsp.access(p, fs.constants.R_OK);
    return true;
  } catch {
    return false;
  }
}

/**
 * Keep process-wide singletons across Next.js dev hot reloads. Module state is
 * re-evaluated on HMR; `globalThis` is not.
 */
export function globalSingleton<T>(key: string, create: () => T): T {
  const g = globalThis as unknown as Record<string, T | undefined>;
  const existing = g[key];
  if (existing !== undefined) return existing;
  const created = create();
  g[key] = created;
  return created;
}
