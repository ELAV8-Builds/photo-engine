/**
 * Path containment helpers.
 *
 * The server only ever reads media that lives under a folder the user
 * explicitly registered. Every filesystem access that originates from a
 * request must go through `resolveWithinRoot`, which resolves symlinks and
 * rejects anything that escapes the root (`..`, absolute paths, symlink hops).
 */

import fsp from 'fs/promises';
import path from 'path';
import { assertServer } from '../runtime';

assertServer();

export class PathEscapeError extends Error {
  constructor(message = 'Path is outside the permitted root') {
    super(message);
    this.name = 'PathEscapeError';
  }
}

/** True when `candidate` equals `root` or is nested inside it. Both must be absolute + normalised. */
export function isWithin(root: string, candidate: string): boolean {
  const rel = path.relative(root, candidate);
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
}

/**
 * Resolve `relPath` under `rootRealPath` and verify — after following symlinks —
 * that the result is still inside the root. Returns the real absolute path.
 */
export async function resolveWithinRoot(rootRealPath: string, relPath: string): Promise<string> {
  if (path.isAbsolute(relPath)) throw new PathEscapeError('Absolute paths are not permitted');
  const joined = path.resolve(rootRealPath, relPath);
  if (!isWithin(rootRealPath, joined)) throw new PathEscapeError();
  const real = await fsp.realpath(joined);
  if (!isWithin(rootRealPath, real)) throw new PathEscapeError('Symlink escapes the permitted root');
  return real;
}

/**
 * Validate a user-supplied directory path for registration: must be absolute,
 * exist, be a directory, and not be a sensitive system location.
 */
export async function validateRootCandidate(input: string): Promise<string> {
  const trimmed = input.trim();
  if (!trimmed) throw new Error('Folder path is empty');
  if (!path.isAbsolute(trimmed)) throw new Error('Folder path must be absolute');

  const real = await fsp.realpath(trimmed).catch(() => {
    throw new Error('Folder does not exist or is not readable');
  });
  const stat = await fsp.stat(real);
  if (!stat.isDirectory()) throw new Error('Path is not a folder');

  // Check both what the user typed and where it really points (macOS maps /etc → /private/etc).
  for (const candidate of [path.normalize(trimmed).replace(/\/+$/, '') || '/', real]) {
    if (FORBIDDEN_ROOTS.has(candidate)) throw new Error('That folder is not allowed as a library');
  }
  return real;
}

/** System locations that are never sensible libraries and would expose unrelated files. */
const FORBIDDEN_ROOTS = new Set([
  '/',
  '/System',
  '/Library',
  '/Applications',
  '/Users',
  '/Volumes',
  '/private',
  '/private/etc',
  '/private/var',
  '/private/tmp',
  '/etc',
  '/var',
  '/tmp',
  '/usr',
  '/bin',
  '/sbin',
  '/opt',
  '/dev',
  '/cores',
]);

/** Root-relative POSIX path for storage and display. */
export function toRelPosix(root: string, absolute: string): string {
  return path.relative(root, absolute).split(path.sep).join('/');
}
