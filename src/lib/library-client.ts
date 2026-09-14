/**
 * Browser-side client for the local library API.
 *
 * Thin, typed fetch wrappers plus the one conversion the editor needs:
 * LibraryItem → MediaFile. No React here so it can be unit-tested and reused.
 */

import type { MediaFile } from '@/types';
import { providerHeaders, type AiProviderSettings } from './provider-settings';
import type {
  CurationRecord,
  JobInfo,
  LibraryItem,
  LibraryItemsPage,
  LibraryRoot,
  MediaKind,
  MontagePick,
  QueueSnapshot,
  ServerSettings,
  StoryPlan,
  SystemCapabilities,
} from '@/types/library';

export class LibraryApiError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
    this.name = 'LibraryApiError';
  }
}

async function request<T>(input: string, init?: RequestInit): Promise<T> {
  const res = await fetch(input, {
    ...init,
    headers: { Accept: 'application/json', ...(init?.body ? { 'Content-Type': 'application/json' } : {}), ...(init?.headers ?? {}) },
  });
  if (!res.ok) {
    let message = `${res.status} ${res.statusText}`;
    try {
      const data = (await res.json()) as { error?: string };
      if (data.error) message = data.error;
    } catch {
      // non-JSON error body
    }
    throw new LibraryApiError(res.status, message);
  }
  return (await res.json()) as T;
}

// ---------------------------------------------------------------------------
// Endpoints
// ---------------------------------------------------------------------------

export const libraryApi = {
  capabilities: () => request<SystemCapabilities>('/api/system/capabilities'),

  /** Opens the native folder dialog on this Mac. Resolves to null when dismissed. */
  async pickFolder(): Promise<string | null> {
    const data = await request<{ path?: string; cancelled?: boolean }>('/api/system/pick-folder', { method: 'POST' });
    return data.path ?? null;
  },

  roots: async () => (await request<{ roots: LibraryRoot[] }>('/api/library/roots')).roots,
  addRoot: (path: string) => request<{ root: LibraryRoot; created: boolean }>('/api/library/roots', { method: 'POST', body: JSON.stringify({ path }) }),
  removeRoot: (id: string) => request<{ removed: boolean }>(`/api/library/roots/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  rescanRoot: (id: string) => request<{ queued: boolean }>(`/api/library/roots/${encodeURIComponent(id)}/rescan`, { method: 'POST' }),

  items: (query: { rootId?: string; kind?: MediaKind; offset?: number; limit?: number } = {}) => {
    const params = new URLSearchParams();
    if (query.rootId) params.set('rootId', query.rootId);
    if (query.kind) params.set('kind', query.kind);
    if (query.offset !== undefined) params.set('offset', String(query.offset));
    if (query.limit !== undefined) params.set('limit', String(query.limit));
    const qs = params.toString();
    return request<LibraryItemsPage>(`/api/library/items${qs ? `?${qs}` : ''}`);
  },
  item: async (id: string) => (await request<{ item: LibraryItem }>(`/api/library/items/${encodeURIComponent(id)}`)).item,

  jobs: () => request<QueueSnapshot>('/api/jobs'),
  pauseJobs: () => request<QueueSnapshot>('/api/jobs', { method: 'POST', body: JSON.stringify({ action: 'pause' }) }),
  resumeJobs: () => request<QueueSnapshot>('/api/jobs', { method: 'POST', body: JSON.stringify({ action: 'resume' }) }),
  cancelJob: (jobId: string) => request<QueueSnapshot>('/api/jobs', { method: 'POST', body: JSON.stringify({ action: 'cancel', jobId }) }),

  settings: () => request<ServerSettings>('/api/settings'),
  updateSettings: (patch: Partial<ServerSettings>) => request<ServerSettings>('/api/settings', { method: 'PUT', body: JSON.stringify(patch) }),

  /** Register this Mac's Photos library as a root (server discovers the path). */
  addPhotosLibrary: () => request<{ root: LibraryRoot; created: boolean }>('/api/system/photos-library', { method: 'POST' }),

  /** Queue model curation for items lacking a record (or the given items; force re-grades). Uses the chosen provider. */
  analyse: (opts: { itemIds?: string[]; force?: boolean } = {}) =>
    request<{ enqueued: number; skipped: number }>('/api/curation/analyse', { method: 'POST', body: JSON.stringify(opts), headers: providerHeaders() }),
  curation: async (id: string) => (await request<{ record: CurationRecord }>(`/api/library/items/${encodeURIComponent(id)}/curation`)).record,
  select: (opts: { slots: number; videoRatio?: number; chronological?: boolean; exclude?: string[] }) =>
    request<{ picks: MontagePick[]; considered: number }>('/api/curation/select', { method: 'POST', body: JSON.stringify(opts) }),

  /** Story plan for the given shots (project order). Model-written when the chosen provider is up, heuristic otherwise. */
  storyPlan: (opts: { keys?: string[]; force?: boolean } = {}) =>
    request<{ plan: StoryPlan; cached: boolean }>('/api/story/plan', { method: 'POST', body: JSON.stringify(opts), headers: providerHeaders() }),

  /** One tiny call to prove a provider (and, for Gemini, the key) works. */
  testProvider: (settings: AiProviderSettings) =>
    request<{ ok: true; provider: string; model: string }>('/api/system/provider-test', { method: 'POST', headers: providerHeaders(settings) }),
  /** Forget the cloud key parked in server memory. */
  clearCloudSession: () => request<{ cleared: boolean }>('/api/system/session', { method: 'DELETE' }),
};

// ---------------------------------------------------------------------------
// URLs
// ---------------------------------------------------------------------------

export const mediaUrl = {
  thumb: (id: string) => `/api/media/${encodeURIComponent(id)}/thumb`,
  image: (id: string, max: 1024 | 2048 | 4096 = 2048) => `/api/media/${encodeURIComponent(id)}/image?max=${max}`,
  stream: (id: string, variant: 'original' | 'proxy' = 'original') => `/api/media/${encodeURIComponent(id)}/stream?variant=${variant}`,
  highlight: (id: string, n: number) => `/api/media/${encodeURIComponent(id)}/highlight/${n}/stream`,
  highlightThumb: (id: string, n: number) => `/api/media/${encodeURIComponent(id)}/highlight/${n}/thumb`,
};

/** Project media id for a library item or one of its highlight windows. */
export function libraryMediaId(itemId: string, highlightIndex?: number): string {
  return highlightIndex === undefined ? `lib-${itemId}` : `lib-${itemId}-hl${highlightIndex}`;
}

/** Key the selection API uses to exclude what is already in the project. */
export function pickKey(itemId: string, highlightIndex?: number): string {
  return highlightIndex === undefined ? itemId : `${itemId}#${highlightIndex}`;
}

/** True when the browser can be expected to decode this video without a proxy. */
export function isBrowserPlayableCodec(codec?: string): boolean {
  return codec === 'h264' || codec === 'vp8' || codec === 'vp9' || codec === 'av1';
}

/**
 * Whether an item can be added to a project right now. 360 videos need their
 * flat proxy; everything else needs at least a probe.
 */
export function isItemUsable(item: LibraryItem): { usable: boolean; reason?: string } {
  if (item.status.probe === 'failed') return { usable: false, reason: item.error ?? 'Could not read this file' };
  if (item.status.probe !== 'ready') return { usable: false, reason: 'Reading file…' };
  if (item.kind === 'video' && item.is360) {
    if (item.status.proxy360 === 'failed') return { usable: false, reason: 'Preview failed' };
    if (item.status.proxy360 !== 'ready') return { usable: false, reason: 'Preparing 360 preview…' };
  }
  return { usable: true };
}

/**
 * Convert a library item to the editor's MediaFile shape. Faces are detected by
 * the caller (browser-side MediaPipe) and passed in.
 */
export function libraryItemToMediaFile(item: LibraryItem, order: number, faces: MediaFile['faces'] = []): MediaFile {
  const width = item.probe?.width ?? 1920;
  const height = item.probe?.height ?? 1080;

  if (item.kind === 'video') {
    const useProxy = item.is360;
    return {
      id: libraryMediaId(item.id),
      url: mediaUrl.stream(item.id, useProxy ? 'proxy' : 'original'),
      name: item.name,
      // The flat proxy is 16:9 regardless of the fisheye source dimensions.
      width: useProxy ? 1280 : width,
      height: useProxy ? 720 : height,
      selected: true,
      faces,
      order,
      type: 'video',
      duration: item.probe?.durationSec ?? 0,
      thumbnailUrl: mediaUrl.thumb(item.id),
      libraryItemId: item.id,
      is360: item.is360,
      capturedAt: item.capturedAt,
    };
  }

  return {
    id: libraryMediaId(item.id),
    url: mediaUrl.image(item.id, 2048),
    name: item.name,
    width,
    height,
    selected: true,
    faces,
    order,
    type: 'photo',
    thumbnailUrl: mediaUrl.thumb(item.id),
    libraryItemId: item.id,
    is360: item.is360,
    capturedAt: item.capturedAt,
  };
}

/**
 * A montage pick → MediaFile. Video highlights become their own trimmed entry:
 * 360 clips play the flat highlight clip when it exists (already cut to the
 * window, so the trim is relative to it), otherwise the full flat proxy with
 * a trim range. Flat videos always use the original with a trim range.
 */
export function montagePickToMediaFile(pick: MontagePick, item: LibraryItem, order: number, faces: MediaFile['faces'] = []): MediaFile {
  if (pick.kind === 'photo' || pick.highlightIndex === undefined || pick.start === undefined || pick.end === undefined) {
    return libraryItemToMediaFile(item, order, faces);
  }
  const base = libraryItemToMediaFile(item, order, faces);
  const useHighlightClip = !!item.is360 && !!pick.highlightProxyReady;
  const windowLen = pick.end - pick.start;
  // The highlight clip carries up to 0.5 s of margin either side of the window.
  const lead = Math.min(HIGHLIGHT_MARGIN_SEC, pick.start);
  return {
    ...base,
    id: libraryMediaId(item.id, pick.highlightIndex),
    name: `${item.name} · ${formatClock(pick.start)}`,
    url: useHighlightClip ? mediaUrl.highlight(item.id, pick.highlightIndex) : base.url,
    thumbnailUrl: useHighlightClip ? mediaUrl.highlightThumb(item.id, pick.highlightIndex) : base.thumbnailUrl,
    width: useHighlightClip ? 1920 : base.width,
    height: useHighlightClip ? 1080 : base.height,
    duration: useHighlightClip ? lead + windowLen + HIGHLIGHT_MARGIN_SEC : base.duration,
    trimStart: useHighlightClip ? lead : pick.start,
    trimEnd: useHighlightClip ? lead + windowLen : pick.end,
    capturedAt: item.capturedAt !== undefined ? item.capturedAt + pick.start * 1000 : undefined,
  };
}

/** Must match the server's highlight render margin. */
const HIGHLIGHT_MARGIN_SEC = 0.5;

function formatClock(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

/** Human-readable job label for the progress UI. */
export function describeJob(job: JobInfo): string {
  switch (job.type) {
    case 'scan-root':
      return 'Scanning folder';
    case 'prepare':
      return 'Reading files & thumbnails';
    case 'proxy360':
      return 'Preparing 360° preview';
    case 'signals':
      return 'Measuring video quality';
    case 'curate':
      return 'Analysing with local AI';
    case 'highlights':
      return 'Rendering highlight clips';
    default:
      return job.type;
  }
}
