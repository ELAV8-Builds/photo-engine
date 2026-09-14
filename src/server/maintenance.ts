/**
 * Start-up housekeeping for the app data directory.
 *
 * Every artefact is written to a `<final>.<pid>.tmp*` sibling and renamed on
 * success, so a crash can only leave temp files behind. At boot we remove any
 * temp file whose owning process is gone, and empty the scratch directory
 * (jobs never survive a restart; the item index is the durable state).
 */

import fsp from 'fs/promises';
import path from 'path';
import { assertServer, dataPath, DATA_SUBDIRS, type DataSubdir } from './runtime';
import { createLogger } from './log';

assertServer();

const log = createLogger('maintenance');

/** `<final>.<pid>.tmp[.ext]` — the in-progress sibling every atomic write uses. */
export const TEMP_WITH_PID = /\.(\d+)\.tmp(\.[a-z0-9]+)?$/i;

function processAlive(pid: number): boolean {
  if (pid === process.pid) return true;
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return (err as NodeJS.ErrnoException).code === 'EPERM';
  }
}

async function sweepDir(dir: string): Promise<number> {
  let removed = 0;
  let entries: string[];
  try {
    entries = await fsp.readdir(dir);
  } catch {
    return 0;
  }
  for (const name of entries) {
    const m = TEMP_WITH_PID.exec(name);
    if (!m) continue;
    if (processAlive(Number(m[1]))) continue;
    await fsp.rm(path.join(dir, name), { force: true });
    removed += 1;
  }
  return removed;
}

export async function sweepStaleArtifacts(): Promise<void> {
  const cacheDirs: DataSubdir[] = ['thumbs', 'renditions', 'proxies', 'analysis', 'state'];
  let removed = 0;
  for (const sub of cacheDirs) removed += await sweepDir(dataPath(sub));
  removed += await sweepDir(path.join(dataPath('state'), 'index'));

  // Scratch space is per-job and jobs do not outlive the process.
  const tmpRoot = dataPath('tmp');
  try {
    const entries = await fsp.readdir(tmpRoot);
    for (const name of entries) {
      await fsp.rm(path.join(tmpRoot, name), { recursive: true, force: true });
      removed += 1;
    }
  } catch {
    // tmp dir may not exist yet
  }

  if (removed > 0) log.info(`removed ${removed} stale temp artefact(s)`, { dirs: Object.keys(DATA_SUBDIRS).length });
}
