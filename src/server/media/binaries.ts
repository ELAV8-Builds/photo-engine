/**
 * Locate the external tools the media pipeline shells out to.
 *
 * Nothing here is installed by PhotoForge; we only discover what the machine
 * already has. Discovery is cached per process.
 */

import path from 'path';
import { assertServer, fileExistsSync } from '../runtime';

assertServer();

export type ToolName = 'ffmpeg' | 'ffprobe' | 'sips' | 'exiftool' | 'osascript' | 'nice';

const WELL_KNOWN_DIRS = ['/opt/homebrew/bin', '/usr/local/bin', '/usr/bin', '/bin'];

const cache = new Map<ToolName, string | null>();

/**
 * Resolve a tool to an absolute path, or null when absent.
 * PHOTOFORGE_TOOLS_DIR (a directory) is checked first so a user can point at a
 * specific ffmpeg build without touching PATH.
 */
export function findTool(name: ToolName): string | null {
  if (cache.has(name)) return cache.get(name) ?? null;

  const candidates: string[] = [];
  const override = process.env.PHOTOFORGE_TOOLS_DIR;
  if (override) candidates.push(path.join(override, name));
  for (const dir of WELL_KNOWN_DIRS) candidates.push(path.join(dir, name));
  for (const dir of (process.env.PATH ?? '').split(path.delimiter)) {
    if (dir) candidates.push(path.join(dir, name));
  }

  const found = candidates.find(fileExistsSync) ?? null;
  cache.set(name, found);
  return found;
}

export function requireTool(name: ToolName): string {
  const p = findTool(name);
  if (!p) throw new Error(`Required tool "${name}" was not found. Install it (e.g. brew install ${name}) and restart.`);
  return p;
}
