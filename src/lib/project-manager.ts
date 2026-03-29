/**
 * Project Manager — persistent storage for PhotoForge projects.
 *
 * Saves the full project state (media, template, music, settings)
 * into IndexedDB so users can revisit, edit, and rebuild projects.
 */

import { v4 as uuid } from 'uuid';
import { MediaFile, MusicTrack } from '@/types';
import { dbGetAll, dbGet, dbPut, dbDelete, dbSearch, dbCount, STORES, dbGetAllByIndex } from './db';

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
  textOverrides: Record<number, string | null>;
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
  /** Image/video blob stored in the project */
  mediaBlob: Blob;
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
  textOverrides: Record<number, string | null>;
  totalDuration: number;
}): Promise<string> {
  const id = uuid();
  const now = Date.now();

  // Generate thumbnail from first selected media
  const thumbnailUrl = await generateProjectThumbnail(opts.media);

  // Convert MediaFiles to saveable format
  const mediaItems = await Promise.all(
    opts.media.map(async (m) => {
      const blob = await fetchBlobFromUrl(m.url);
      const thumbnailDataUrl = m.type === 'video'
        ? (m.thumbnailUrl || '')
        : await generateThumbnailDataUrl(m.url, 200);

      const item: SavedMediaItem = {
        id: m.id,
        name: m.name,
        mediaBlob: blob,
        mimeType: blob.type || (m.type === 'video' ? 'video/mp4' : 'image/jpeg'),
        width: m.width,
        height: m.height,
        selected: m.selected,
        order: m.order,
        type: m.type,
        duration: m.duration,
        trimStart: m.trimStart,
        trimEnd: m.trimEnd,
        thumbnailDataUrl,
      };
      return item;
    }),
  );

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
    textOverrides?: Record<number, string | null>;
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
    existing.mediaItems = await Promise.all(
      opts.media.map(async (m) => {
        const blob = await fetchBlobFromUrl(m.url);
        return {
          id: m.id,
          name: m.name,
          mediaBlob: blob,
          mimeType: blob.type || (m.type === 'video' ? 'video/mp4' : 'image/jpeg'),
          width: m.width,
          height: m.height,
          selected: m.selected,
          order: m.order,
          type: m.type,
          duration: m.duration,
          trimStart: m.trimStart,
          trimEnd: m.trimEnd,
          thumbnailDataUrl: m.type === 'video' ? (m.thumbnailUrl || '') : await generateThumbnailDataUrl(m.url, 200),
        };
      }),
    );
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
  textOverrides: Record<number, string | null>;
} | null> {
  const project = await dbGet<SavedProject>(STORES.projects, id);
  if (!project) return null;

  // Convert SavedMediaItems back to MediaFiles
  const media: MediaFile[] = project.mediaItems.map((item) => {
    const url = URL.createObjectURL(item.mediaBlob);
    return {
      id: item.id,
      file: new File([item.mediaBlob], item.name, { type: item.mimeType }),
      url,
      name: item.name,
      width: item.width,
      height: item.height,
      selected: item.selected,
      faces: [], // Faces will be re-detected on load
      order: item.order,
      type: item.type,
      duration: item.duration,
      trimStart: item.trimStart,
      trimEnd: item.trimEnd,
      thumbnailUrl: item.thumbnailDataUrl,
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
