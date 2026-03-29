/**
 * Trim Memory — remembers per-video trim settings across sessions.
 *
 * Uses a fingerprint of (filename + file size) to identify videos.
 * Stores trim start/end in the IndexedDB settings store.
 */

import { dbGet, dbPut, STORES } from './db';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface TrimMemoryEntry {
  key: string;
  trimStart: number;
  trimEnd: number;
  updatedAt: number;
}

// ---------------------------------------------------------------------------
// Fingerprinting
// ---------------------------------------------------------------------------

/**
 * Generate a fingerprint for a video file based on name + size.
 * This is fast (no hashing) and good enough for matching re-imported files.
 */
function getVideoFingerprint(fileName: string, fileSize: number): string {
  return `trim:${fileName}:${fileSize}`;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Save trim settings for a video file.
 */
export async function saveTrimMemory(
  fileName: string,
  fileSize: number,
  trimStart: number,
  trimEnd: number,
): Promise<void> {
  const key = getVideoFingerprint(fileName, fileSize);
  try {
    await dbPut(STORES.settings, {
      key,
      trimStart,
      trimEnd,
      updatedAt: Date.now(),
    } satisfies TrimMemoryEntry);
    console.log(`[TrimMemory] Saved trim for "${fileName}": ${trimStart}s—${trimEnd}s`);
  } catch (err) {
    console.warn('[TrimMemory] Failed to save trim:', err);
  }
}

/**
 * Load previously saved trim settings for a video file.
 * Returns null if no saved trim is found.
 */
export async function loadTrimMemory(
  fileName: string,
  fileSize: number,
): Promise<{ trimStart: number; trimEnd: number } | null> {
  const key = getVideoFingerprint(fileName, fileSize);
  try {
    const entry = await dbGet<TrimMemoryEntry>(STORES.settings, key);
    if (entry && typeof entry.trimStart === 'number' && typeof entry.trimEnd === 'number') {
      console.log(`[TrimMemory] Restored trim for "${fileName}": ${entry.trimStart}s—${entry.trimEnd}s`);
      return { trimStart: entry.trimStart, trimEnd: entry.trimEnd };
    }
  } catch (err) {
    console.warn('[TrimMemory] Failed to load trim:', err);
  }
  return null;
}
