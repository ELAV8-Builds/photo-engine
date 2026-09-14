/**
 * Project Manager — persistent storage for PhotoForge projects.
 *
 * Saves the full project state (media, template, music, settings)
 * into IndexedDB so users can revisit, edit, and rebuild projects.
 */

import { v4 as uuid } from 'uuid';
import { MediaFile, MusicTrack, TextOverlayOverride } from '@/types';
import type { CurationRecord, LibraryItem, MontagePick } from '@/types/library';
import { dbGetAll, dbGet, dbPut, dbDelete, dbSearch, dbCount, STORES, dbGetAllByIndex } from './db';
import { libraryApi, mediaUrl, montagePickToMediaFile } from './library-client';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SavedProject {
  id: string;
  name: string;
  /** Thumbnail data URL (JPEG, max 400px wide) */
  thumbnailUrl: string;
  /** Template ID used */
  templateId: string | null;
  /** Aspect ratio */
  aspectRatio: '16:9' | '9:16' | '1:1';
  /** Output quality */
  outputQuality: '720p' | '1080p' | '4k';
  /** Title text */
  title: string;
  /** Text overlay overrides */
  textOverrides: Record<number, TextOverlayOverride>;
  /** Media files — stored as serializable data (blobs stored separately) */
  mediaItems: SavedMediaItem[];
  /** Music track metadata (blob stored in song library or inline) */
  musicTrack: SavedMusicTrack | null;
  /** Number of selected media items */
  mediaCount: number;
  /** Timestamps */
  createdAt: number;
  updatedAt: number;
  /** Total duration of the project in seconds */
  totalDuration: number;
}

/** Media item without File object — stored as blob + metadata */
export interface SavedMediaItem {
  id: string;
  name: string;
  /**
   * Image/video blob stored in the project. Absent for library-backed items,
   * which are re-resolved from the local server by `libraryItemId` on load
   * (copying a multi-gigabyte source into IndexedDB is neither needed nor wise).
   */
  mediaBlob?: Blob;
  /** Library item id when the media lives in a scanned folder. */
  libraryItemId?: string;
  is360?: boolean;
  capturedAt?: number;
  /** MIME type */
  mimeType: string;
  width: number;
  height: number;
  selected: boolean;
  order: number;
  type: 'photo' | 'video';
  duration?: number;
  trimStart?: number;
  trimEnd?: number;
  /** Thumbnail URL for quick display (data URL) */
  thumbnailDataUrl?: string;
}

/** Music track stored with project */
export interface SavedMusicTrack {
  id: string;
  name: string;
  /** Audio blob (if not from song library) */
  audioBlob?: Blob;
  /** Song library ID (if from library) */
  songLibraryId?: string;
  duration: number;
  source: 'upload' | 'youtube';
}

/** Lightweight project info for grid listing */
export interface ProjectSummary {
  id: string;
  name: string;
  thumbnailUrl: string;
  templateId: string | null;
  mediaCount: number;
  totalDuration: number;
  createdAt: number;
  updatedAt: number;
  aspectRatio: '16:9' | '9:16' | '1:1';
}

// ---------------------------------------------------------------------------
// Save / Load
// ---------------------------------------------------------------------------

/**
 * Save a new project from current editor state.
 */
export async function saveProject(opts: {
  name: string;
  media: MediaFile[];
  templateId: string | null;
  music: MusicTrack | null;
  title: string;
  aspectRatio: '16:9' | '9:16' | '1:1';
  outputQuality: '720p' | '1080p' | '4k';
  textOverrides: Record<number, TextOverlayOverride>;
  totalDuration: number;
}): Promise<string> {
  const id = uuid();
  const now = Date.now();

  // Generate thumbnail from first selected media
  const thumbnailUrl = await generateProjectThumbnail(opts.media);

  // Convert MediaFiles to saveable format
  const mediaItems = await Promise.all(opts.media.map(toSavedMediaItem));

  // Convert music track
  let musicTrack: SavedMusicTrack | null = null;
  if (opts.music) {
    let audioBlob: Blob | undefined;
    if (opts.music.file) {
      audioBlob = opts.music.file;
    } else if (opts.music.url) {
      try {
        audioBlob = await fetchBlobFromUrl(opts.music.url);
      } catch {
        // Music URL might be expired — save without blob
      }
    }

    musicTrack = {
      id: opts.music.id,
      name: opts.music.name,
      audioBlob,
      duration: opts.music.duration,
      source: opts.music.source,
    };
  }

  const project: SavedProject = {
    id,
    name: opts.name,
    thumbnailUrl,
    templateId: opts.templateId,
    aspectRatio: opts.aspectRatio,
    outputQuality: opts.outputQuality,
    title: opts.title,
    textOverrides: opts.textOverrides,
    mediaItems,
    musicTrack,
    mediaCount: opts.media.filter((m) => m.selected).length,
    createdAt: now,
    updatedAt: now,
    totalDuration: opts.totalDuration,
  };

  await dbPut(STORES.projects, project);
  console.log(`[ProjectManager] Saved project "${project.name}" (${mediaItems.length} media items)`);
  return id;
}

/**
 * Update an existing project (re-save with new state).
 */
export async function updateProject(
  id: string,
  opts: {
    name?: string;
    media?: MediaFile[];
    templateId?: string | null;
    music?: MusicTrack | null;
    title?: string;
    aspectRatio?: '16:9' | '9:16' | '1:1';
    outputQuality?: '720p' | '1080p' | '4k';
    textOverrides?: Record<number, TextOverlayOverride>;
    totalDuration?: number;
  },
): Promise<void> {
  const existing = await dbGet<SavedProject>(STORES.projects, id);
  if (!existing) throw new Error(`Project ${id} not found`);

  // Update simple fields
  if (opts.name !== undefined) existing.name = opts.name;
  if (opts.templateId !== undefined) existing.templateId = opts.templateId;
  if (opts.title !== undefined) existing.title = opts.title;
  if (opts.aspectRatio !== undefined) existing.aspectRatio = opts.aspectRatio;
  if (opts.outputQuality !== undefined) existing.outputQuality = opts.outputQuality;
  if (opts.textOverrides !== undefined) existing.textOverrides = opts.textOverrides;
  if (opts.totalDuration !== undefined) existing.totalDuration = opts.totalDuration;

  // Update media if provided
  if (opts.media) {
    existing.mediaItems = await Promise.all(opts.media.map(toSavedMediaItem));
    existing.mediaCount = opts.media.filter((m) => m.selected).length;
    existing.thumbnailUrl = await generateProjectThumbnail(opts.media);
  }

  existing.updatedAt = Date.now();
  await dbPut(STORES.projects, existing);
  console.log(`[ProjectManager] Updated project "${existing.name}"`);
}

/**
 * Load a project and restore it to editor-friendly format.
 */
export async function loadProject(id: string): Promise<{
  media: MediaFile[];
  templateId: string | null;
  music: MusicTrack | null;
  title: string;
  aspectRatio: '16:9' | '9:16' | '1:1';
  outputQuality: '720p' | '1080p' | '4k';
  textOverrides: Record<number, TextOverlayOverride>;
} | null> {
  const project = await dbGet<SavedProject>(STORES.projects, id);
  if (!project) return null;

  // Phase 9 (§3.1): a saved 360 moment (`lib-<id>-hl<n>`) is re-resolved against
  // the item's current curation record, so it plays the moment's own clip —
  // the pre-Phase-9 loader pointed it at the whole-video proxy, which played
  // the wrong footage under the clip-relative trims. One item+record fetch per
  // distinct clip; the server keeps `n` on the same footage across re-analysis.
  const momentSources = new Map<string, { item: LibraryItem; record: CurationRecord } | null>();
  const momentItemIds = Array.from(new Set(project.mediaItems.filter((m) => m.libraryItemId && m.is360 && m.type === 'video' && HL_ID.test(m.id)).map((m) => m.libraryItemId!)));
  await Promise.all(
    momentItemIds.map(async (itemId) => {
      try {
        const [item, record] = await Promise.all([libraryApi.item(itemId), libraryApi.curation(itemId)]);
        momentSources.set(itemId, { item, record });
      } catch {
        momentSources.set(itemId, null); // server down or item/record gone — fall back below
      }
    }),
  );

  // Convert SavedMediaItems back to MediaFiles
  const media: MediaFile[] = project.mediaItems.map((item) => {
    const common = {
      id: item.id,
      name: item.name,
      width: item.width,
      height: item.height,
      selected: item.selected,
      faces: [] as MediaFile['faces'], // Faces will be re-detected on load
      order: item.order,
      type: item.type,
      duration: item.duration,
      trimStart: item.trimStart,
      trimEnd: item.trimEnd,
      thumbnailUrl: item.thumbnailDataUrl,
    };

    // Library-backed: the local server still streams it; nothing was copied.
    if (item.libraryItemId) {
      const hl = HL_ID.exec(item.id);
      if (hl && item.type === 'video' && item.is360) {
        return restoreSavedMoment(item, Number(hl[2]), momentSources.get(item.libraryItemId) ?? null, common);
      }
      const useProxy = item.type === 'video' && !!item.is360;
      return {
        ...common,
        url: item.type === 'video' ? mediaUrl.stream(item.libraryItemId, useProxy ? 'proxy' : 'original') : mediaUrl.image(item.libraryItemId, 2048),
        libraryItemId: item.libraryItemId,
        is360: item.is360,
        capturedAt: item.capturedAt,
      };
    }

    const blob = item.mediaBlob ?? new Blob([], { type: item.mimeType });
    return {
      ...common,
      file: new File([blob], item.name, { type: item.mimeType }),
      url: URL.createObjectURL(blob),
    };
  });

  // Convert music track
  let music: MusicTrack | null = null;
  if (project.musicTrack) {
    const mt = project.musicTrack;
    let url = '';
    if (mt.audioBlob) {
      url = URL.createObjectURL(mt.audioBlob);
    }

    music = {
      id: mt.id,
      name: mt.name,
      file: mt.audioBlob ? new File([mt.audioBlob], mt.name, { type: 'audio/mpeg' }) : undefined,
      url,
      duration: mt.duration,
      source: mt.source,
    };
  }

  return {
    media,
    templateId: project.templateId,
    music,
    title: project.title,
    aspectRatio: project.aspectRatio,
    outputQuality: project.outputQuality,
    textOverrides: project.textOverrides,
  };
}

// ---------------------------------------------------------------------------
// Listing & Search
// ---------------------------------------------------------------------------

/**
 * Get all projects as summaries (lightweight, no blobs).
 */
export async function getAllProjectSummaries(): Promise<ProjectSummary[]> {
  const projects = await dbGetAllByIndex<SavedProject>(STORES.projects, 'updatedAt', 'prev');
  return projects.map(projectToSummary);
}

/**
 * Search projects by name.
 */
export async function searchProjects(query: string): Promise<ProjectSummary[]> {
  const results = await dbSearch<SavedProject>(STORES.projects, query);
  return results.map(projectToSummary);
}

/**
 * Get project count.
 */
export async function getProjectCount(): Promise<number> {
  return dbCount(STORES.projects);
}

// ---------------------------------------------------------------------------
// Management
// ---------------------------------------------------------------------------

/**
 * Delete a project.
 */
export async function deleteProject(id: string): Promise<void> {
  await dbDelete(STORES.projects, id);
  console.log(`[ProjectManager] Deleted project ${id}`);
}

/**
 * Duplicate a project with a new name.
 */
export async function duplicateProject(id: string, newName?: string): Promise<string> {
  const project = await dbGet<SavedProject>(STORES.projects, id);
  if (!project) throw new Error(`Project ${id} not found`);

  const newId = uuid();
  const now = Date.now();

  const duplicate: SavedProject = {
    ...project,
    id: newId,
    name: newName || `${project.name} (Copy)`,
    createdAt: now,
    updatedAt: now,
  };

  await dbPut(STORES.projects, duplicate);
  console.log(`[ProjectManager] Duplicated project "${project.name}" → "${duplicate.name}"`);
  return newId;
}

/**
 * Rename a project.
 */
export async function renameProject(id: string, newName: string): Promise<void> {
  const project = await dbGet<SavedProject>(STORES.projects, id);
  if (!project) throw new Error(`Project ${id} not found`);

  project.name = newName;
  project.updatedAt = Date.now();
  await dbPut(STORES.projects, project);
}

/**
 * Change template of an existing project.
 */
export async function changeProjectTemplate(id: string, newTemplateId: string): Promise<void> {
  const project = await dbGet<SavedProject>(STORES.projects, id);
  if (!project) throw new Error(`Project ${id} not found`);

  project.templateId = newTemplateId;
  project.updatedAt = Date.now();
  await dbPut(STORES.projects, project);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** `lib-<itemId>-hl<n>` — a saved reference to one moment of a library video. */
const HL_ID = /^lib-([a-f0-9]{20})-hl(\d+)$/;

/**
 * Phase 9 (§3.1): rebuild a saved 360 moment from the item's *current* record,
 * exactly the way a fresh auto-pick would (same URL/trim/readiness logic via
 * `montagePickToMediaFile`). Saved trims survive when they still mean the same
 * thing — i.e. the clip-vs-proxy mode is unchanged — because the user may have
 * hand-trimmed; a mode flip takes the freshly computed coordinates instead.
 * When the record or the window is gone, the moment's own clip URL is kept
 * (a visible 404 is honest; the whole-video proxy under clip-relative trims
 * silently played the wrong footage).
 */
function restoreSavedMoment(
  saved: SavedMediaItem,
  index: number,
  source: { item: LibraryItem; record: CurationRecord } | null,
  common: Omit<MediaFile, 'url'>,
): MediaFile {
  const win = source?.record.highlights.find((h) => h.index === index);
  if (!source || !win) {
    return { ...common, url: mediaUrl.highlight(saved.libraryItemId!, index), libraryItemId: saved.libraryItemId, is360: true, capturedAt: saved.capturedAt };
  }
  const pick: MontagePick = {
    itemId: source.item.id,
    kind: 'video',
    highlightIndex: index,
    start: win.start,
    end: win.end,
    highlightProxyReady: win.proxy === 'ready',
    highlightPanReady: win.panProxy === 'ready',
    highlightPlanetReady: win.planetProxy === 'ready',
    viewVersion: win.view?.version,
    score: win.score,
    caption: win.caption,
  };
  const rebuilt = montagePickToMediaFile(pick, source.item, saved.order);
  // Clip mode renders at 1920×1080; the whole-proxy fallback at 1280×720 (see montagePickToMediaFile).
  const savedClipMode = saved.width === 1920;
  const rebuiltClipMode = !!pick.highlightProxyReady;
  const max = rebuilt.duration ?? 0;
  const trims =
    savedClipMode === rebuiltClipMode && saved.trimStart !== undefined && saved.trimEnd !== undefined
      ? { trimStart: Math.max(0, Math.min(max, saved.trimStart)), trimEnd: Math.max(0, Math.min(max, saved.trimEnd)) }
      : { trimStart: rebuilt.trimStart, trimEnd: rebuilt.trimEnd };
  return { ...rebuilt, selected: saved.selected, ...trims };
}

function projectToSummary(p: SavedProject): ProjectSummary {
  return {
    id: p.id,
    name: p.name,
    thumbnailUrl: p.thumbnailUrl,
    templateId: p.templateId,
    mediaCount: p.mediaCount,
    totalDuration: p.totalDuration,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
    aspectRatio: p.aspectRatio,
  };
}

async function fetchBlobFromUrl(url: string): Promise<Blob> {
  const res = await fetch(url);
  return res.blob();
}

/**
 * Serialise one editor MediaFile for IndexedDB. Uploaded files are copied in
 * as blobs; library-backed items are stored by reference (id + server URLs).
 */
async function toSavedMediaItem(m: MediaFile): Promise<SavedMediaItem> {
  const base = {
    id: m.id,
    name: m.name,
    width: m.width,
    height: m.height,
    selected: m.selected,
    order: m.order,
    type: m.type,
    duration: m.duration,
    trimStart: m.trimStart,
    trimEnd: m.trimEnd,
  };

  if (m.libraryItemId) {
    return {
      ...base,
      libraryItemId: m.libraryItemId,
      is360: m.is360,
      capturedAt: m.capturedAt,
      mimeType: m.type === 'video' ? 'video/mp4' : 'image/jpeg',
      thumbnailDataUrl: m.thumbnailUrl ?? '',
    };
  }

  const blob = await fetchBlobFromUrl(m.url);
  return {
    ...base,
    mediaBlob: blob,
    mimeType: blob.type || (m.type === 'video' ? 'video/mp4' : 'image/jpeg'),
    thumbnailDataUrl: m.type === 'video' ? (m.thumbnailUrl || '') : await generateThumbnailDataUrl(m.url, 200),
  };
}

/**
 * Generate a small thumbnail data URL from an image URL.
 */
async function generateThumbnailDataUrl(imageUrl: string, maxWidth: number): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const scale = Math.min(1, maxWidth / img.naturalWidth);
      canvas.width = img.naturalWidth * scale;
      canvas.height = img.naturalHeight * scale;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/jpeg', 0.6));
      } else {
        resolve('');
      }
    };
    img.onerror = () => resolve('');
    img.src = imageUrl;
  });
}

/**
 * Generate a project thumbnail from the first selected media item.
 */
async function generateProjectThumbnail(media: MediaFile[]): Promise<string> {
  const selected = media.filter((m) => m.selected);
  if (selected.length === 0) return '';

  const first = selected[0];
  if (first.type === 'video' && first.thumbnailUrl) {
    return first.thumbnailUrl;
  }

  return generateThumbnailDataUrl(first.url, 400);
}
