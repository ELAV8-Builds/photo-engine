/**
 * Song Library — persistent storage for audio tracks.
 *
 * Songs are stored in IndexedDB with their audio blobs so they
 * persist across sessions. "Rip once, use forever."
 */

import { v4 as uuid } from 'uuid';
import { dbGetAll, dbGet, dbPut, dbDelete, dbSearch, dbCount, STORES, dbGetAllByIndex } from './db';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface LibrarySong {
  id: string;
  name: string;
  /** Original filename or YouTube title */
  originalName: string;
  /** Audio blob stored directly in IndexedDB */
  audioBlob: Blob;
  /** Blob URL — created on demand, NOT stored */
  duration: number;
  /** File size in bytes */
  size: number;
  /** MIME type */
  mimeType: string;
  source: 'upload' | 'youtube';
  /** YouTube URL if applicable */
  sourceUrl?: string;
  dateAdded: number; // timestamp ms
  /** User-assigned tags for organization */
  tags: string[];
  /** Number of times used in projects */
  useCount: number;
}

/** Lightweight version without the blob — for listing */
export type LibrarySongMeta = Omit<LibrarySong, 'audioBlob'>;

// ---------------------------------------------------------------------------
// CRUD
// ---------------------------------------------------------------------------

/**
 * Save a song to the library.
 * Accepts a File/Blob + metadata. Returns the saved song ID.
 */
export async function saveSong(opts: {
  name: string;
  audioBlob: Blob;
  duration: number;
  source: 'upload' | 'youtube';
  sourceUrl?: string;
}): Promise<string> {
  const id = uuid();
  const song: LibrarySong = {
    id,
    name: opts.name.replace(/\.[^/.]+$/, ''), // Strip extension from name
    originalName: opts.name,
    audioBlob: opts.audioBlob,
    duration: opts.duration,
    size: opts.audioBlob.size,
    mimeType: opts.audioBlob.type || 'audio/mpeg',
    source: opts.source,
    sourceUrl: opts.sourceUrl,
    dateAdded: Date.now(),
    tags: [],
    useCount: 0,
  };

  await dbPut(STORES.songs, song);
  console.log(`[SongLibrary] Saved "${song.name}" (${formatSize(song.size)})`);
  return id;
}

/**
 * Save from a MusicTrack (the current app format).
 * Fetches the blob from the URL if needed.
 */
export async function saveSongFromTrack(track: {
  name: string;
  url: string;
  file?: File;
  duration: number;
  source: 'upload' | 'youtube';
}): Promise<string> {
  let blob: Blob;

  if (track.file) {
    blob = track.file;
  } else if (track.url) {
    // Fetch the audio blob from the URL
    const res = await fetch(track.url);
    blob = await res.blob();
  } else {
    throw new Error('No audio source available');
  }

  return saveSong({
    name: track.name,
    audioBlob: blob,
    duration: track.duration,
    source: track.source,
    sourceUrl: track.source === 'youtube' ? track.url : undefined,
  });
}

/**
 * Get a song by ID (including blob).
 */
export async function getSong(id: string): Promise<LibrarySong | undefined> {
  return dbGet<LibrarySong>(STORES.songs, id);
}

/**
 * Get all songs, sorted by most recently added.
 */
export async function getAllSongs(): Promise<LibrarySong[]> {
  return dbGetAllByIndex<LibrarySong>(STORES.songs, 'dateAdded', 'prev');
}

/**
 * Get all songs metadata (without blobs — lightweight for listing).
 */
export async function getAllSongsMeta(): Promise<LibrarySongMeta[]> {
  const songs = await getAllSongs();
  return songs.map(({ audioBlob: _blob, ...meta }) => meta);
}

/**
 * Search songs by name.
 */
export async function searchSongs(query: string): Promise<LibrarySongMeta[]> {
  const results = await dbSearch<LibrarySong>(STORES.songs, query);
  return results.map(({ audioBlob: _blob, ...meta }) => meta);
}

/**
 * Delete a song from the library.
 */
export async function deleteSong(id: string): Promise<void> {
  await dbDelete(STORES.songs, id);
  console.log(`[SongLibrary] Deleted song ${id}`);
}

/**
 * Update song metadata (name, tags).
 */
export async function updateSong(
  id: string,
  updates: Partial<Pick<LibrarySong, 'name' | 'tags'>>,
): Promise<void> {
  const song = await getSong(id);
  if (!song) throw new Error(`Song ${id} not found`);

  if (updates.name !== undefined) song.name = updates.name;
  if (updates.tags !== undefined) song.tags = updates.tags;

  await dbPut(STORES.songs, song);
}

/**
 * Increment use count (called when a song is used in a project).
 */
export async function incrementUseCount(id: string): Promise<void> {
  const song = await getSong(id);
  if (!song) return;
  song.useCount++;
  await dbPut(STORES.songs, song);
}

/**
 * Get song count.
 */
export async function getSongCount(): Promise<number> {
  return dbCount(STORES.songs);
}

/**
 * Create a temporary object URL for playback.
 * Caller is responsible for revoking with URL.revokeObjectURL().
 */
export function createSongUrl(song: LibrarySong): string {
  return URL.createObjectURL(song.audioBlob);
}

/**
 * Check if a song with the same name already exists.
 */
export async function songExists(name: string): Promise<boolean> {
  const all = await dbGetAll<LibrarySong>(STORES.songs);
  const normalized = name.toLowerCase().replace(/\.[^/.]+$/, '');
  return all.some((s) => s.name.toLowerCase() === normalized);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
