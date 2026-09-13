/**
 * Library DTOs — shared between the browser and the local server.
 *
 * Rules:
 * - Plain data only. No server imports, no browser globals.
 * - The browser never sees absolute filesystem paths; items are addressed by id.
 * - Everything here is JSON-serialisable (no Blob/File/Date).
 */

export type MediaKind = 'photo' | 'video';

/** Lifecycle of a background processing step for one item. */
export type ProcessingState = 'pending' | 'processing' | 'ready' | 'failed' | 'skipped';

/** A registered folder the server is allowed to read. */
export interface LibraryRoot {
  id: string;
  /** Absolute path — shown to the user, who chose it. */
  path: string;
  /** Last path segment, for compact display. */
  label: string;
  addedAt: number;
  lastScanAt?: number;
  itemCount: number;
}

/**
 * How the pixels of a source are laid out. Drives thumbnailing, reframing and
 * analysis so every consumer agrees on what a frame looks like.
 */
export type FrameLayout =
  /** Ordinary flat photo or video. */
  | 'flat'
  /** Two circular fisheye video streams in one container (Insta360 .insv). */
  | 'dual-fisheye-streams'
  /** Two fisheye circles side by side in a single frame (Insta360 .lrv proxy). */
  | 'dual-fisheye-sbs';

export interface MediaProbe {
  width: number;
  height: number;
  durationSec?: number;
  fps?: number;
  videoCodec?: string;
  videoStreams?: number;
  hasAudio?: boolean;
  audioSampleRate?: number;
}

export interface ItemStatus {
  probe: ProcessingState;
  thumb: ProcessingState;
  signals: ProcessingState;
  /** Flat, browser-playable preview for 360 videos. */
  proxy360: ProcessingState;
}

export interface LibraryItem {
  /** Stable identity: hash of (root-relative path, size, mtime). Changes if the file changes. */
  id: string;
  rootId: string;
  /** Path relative to the root, POSIX separators. */
  relPath: string;
  name: string;
  /** Lowercase extension without the dot. */
  ext: string;
  kind: MediaKind;
  sizeBytes: number;
  mtimeMs: number;
  /** Best-effort capture time (epoch ms). */
  capturedAt?: number;
  is360: boolean;
  layout: FrameLayout;
  /** A camera-generated low-res proxy (.lrv) exists next to this item. */
  hasCameraProxy: boolean;
  probe?: MediaProbe;
  status: ItemStatus;
  /** Last error message across steps, if any. */
  error?: string;
}

export interface LibraryItemsPage {
  items: LibraryItem[];
  total: number;
  offset: number;
  limit: number;
}

// ---------------------------------------------------------------------------
// Background jobs
// ---------------------------------------------------------------------------

export type JobLane = 'ffmpeg' | 'model' | 'io';

/**
 * scan-root — walk a folder and refresh its index.
 * prepare   — probe + thumbnail (+ capture time) for one item. Runs first so the grid fills fast.
 * proxy360  — flat browser-playable preview for a 360 video.
 * signals   — Stage-1 per-second measurements for a video (Phase 2 input).
 */
export type JobType = 'scan-root' | 'prepare' | 'proxy360' | 'signals';

export type JobState = 'queued' | 'running' | 'done' | 'failed' | 'cancelled';

export interface JobInfo {
  id: string;
  type: JobType;
  lane: JobLane;
  state: JobState;
  itemId?: string;
  rootId?: string;
  /** 0–1 when the handler reports progress. */
  progress?: number;
  createdAt: number;
  startedAt?: number;
  finishedAt?: number;
  error?: string;
}

export interface QueueSnapshot {
  paused: boolean;
  queued: number;
  running: JobInfo[];
  /** Counts by state since the server started. */
  totals: Record<JobState, number>;
  /** Most recent finished jobs, newest first. */
  recent: JobInfo[];
}

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

/**
 * quiet    — nice 19, 2 threads, sparse sampling.
 * balanced — nice 15, 4 threads. Default.
 * fast     — nice 5, 8 threads. Still one job per lane.
 */
export type PerformanceProfile = 'quiet' | 'balanced' | 'fast';

export interface ServerSettings {
  performanceProfile: PerformanceProfile;
}

// ---------------------------------------------------------------------------
// Stage-1 analysis signals (consumed by Phase 2)
// ---------------------------------------------------------------------------

/**
 * Cheap per-sample measurements from a single ffmpeg pass, plus a deterministic
 * per-second technical verdict. Sample index i is at time t[i].
 */
export interface SignalTrack {
  version: 1;
  itemId: string;
  sampleFps: number;
  durationSec: number;
  t: number[];
  /** Mean luma 0–255 of the analysed region. */
  brightness: number[];
  /** Scene-change score 0–1 versus previous sample (motion / novelty). */
  motion: number[];
  /** Mean Sobel edge energy 0–255 (sharpness proxy). */
  sharpness: number[];
  /** RMS level in dBFS per whole second; null where the source has no audio or no sample. */
  audioRmsDb: Array<number | null>;
  perSecond: TechnicalVerdict;
}

export interface TechnicalVerdict {
  /** Second index → passes brightness / sharpness / shake gates. */
  usable: boolean[];
  /** 0–1 blended technical quality. */
  technical: number[];
  /** Loudness spike relative to the clip (laughter, cheer, crash). */
  audioEvent: boolean[];
  /** Visual novelty peak (cut or large content change). */
  novelty: boolean[];
}

export interface SystemCapabilities {
  platform: NodeJS.Platform;
  appDataDir: string;
  ffmpeg: { found: boolean; path?: string; version?: string; videotoolbox: boolean };
  ffprobe: { found: boolean; path?: string };
  sips: boolean;
  exiftool: boolean;
  nativeFolderPicker: boolean;
}
