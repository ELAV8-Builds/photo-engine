/**
 * macOS Photos library discovery.
 *
 * Apple's Photos keeps originals as plain files inside
 * `~/Pictures/<name>.photoslibrary/originals/<0-f>/<uuid>.<ext>`, so the
 * existing folder scanner can index a Photos library by registering that
 * `originals` folder as a root — no export, no copies, and curation runs on
 * the real files. The catch is privacy: macOS blocks every process from the
 * bundle until the app that launched PhotoForge has Full Disk Access, which
 * we detect and explain instead of failing mid-scan.
 *
 * The library path never leaves the server; the browser sees a label and flags.
 */

import fsp from 'fs/promises';
import os from 'os';
import path from 'path';
import { assertServer } from '../runtime';

assertServer();

const LIBRARY_EXT = '.photoslibrary';
const DEFAULT_NAME = 'Photos Library';

export interface DetectedPhotosLibrary {
  /** The .photoslibrary bundle. */
  bundlePath: string;
  /** The folder to register as a root. */
  originalsPath: string;
  label: string;
  readable: boolean;
}

/** Newest `.photoslibrary` in ~/Pictures, preferring Apple's default name. */
export async function detectPhotosLibrary(picturesDir = path.join(os.homedir(), 'Pictures')): Promise<DetectedPhotosLibrary | null> {
  if (process.platform !== 'darwin') return null;
  let entries: string[];
  try {
    entries = await fsp.readdir(picturesDir);
  } catch {
    return null;
  }
  const bundles = entries.filter((n) => n.endsWith(LIBRARY_EXT));
  if (bundles.length === 0) return null;

  let chosen: string | undefined = bundles.find((n) => n === `${DEFAULT_NAME}${LIBRARY_EXT}`);
  if (!chosen) {
    const stats = await Promise.all(bundles.map(async (n) => ({ n, mtime: (await fsp.stat(path.join(picturesDir, n)).catch(() => null))?.mtimeMs ?? 0 })));
    chosen = stats.sort((a, b) => b.mtime - a.mtime)[0]!.n;
  }

  const bundlePath = path.join(picturesDir, chosen);
  const originalsPath = path.join(bundlePath, 'originals');
  return {
    bundlePath,
    originalsPath,
    label: chosen.slice(0, -LIBRARY_EXT.length),
    readable: await canRead(originalsPath),
  };
}

async function canRead(dir: string): Promise<boolean> {
  try {
    await fsp.readdir(dir);
    return true;
  } catch {
    return false;
  }
}

export const PHOTOS_PERMISSION_HELP =
  'macOS is protecting your Photos library. Open System Settings → Privacy & Security → Full Disk Access, ' +
  'enable the app you launch PhotoForge from (Terminal or your editor), then restart PhotoForge and try again.';
