/**
 * Library DTOs — shared between the browser and the local server.
 *
 * Rules:
 * - Plain data only. No server imports, no browser globals.
 * - The browser never sees absolute filesystem paths; items are addressed by id.
 * - Everything here is JSON-serialisable (no Blob/File/Date).
 */

import type { TemplateStyle } from './index';

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
  /** Local-model curation (score, highlights). Phase 2. */
  curate: ProcessingState;
  /** Flat 1080p clips for each chosen 360 highlight; 'skipped' for photos and flat videos. */
  highlights: ProcessingState;
}

/**
 * Compact curation summary carried on the item so lists can sort and badge
 * without loading every record. The full record lives in the analysis cache.
 */
export interface CurationSummary {
  /** 0–1 overall. Photos: from the grade. Videos: best highlight. */
  score: number;
  highlightCount: number;
  caption?: string;
  scene?: string;
  people: boolean;
  faces: boolean;
  model: string;
  gradedAt: number;
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
  /** Present once the curate step has produced a record. */
  curation?: CurationSummary;
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
 * curate    — local vision-model grading; videos also get ranked highlight windows.
 * highlights— flat 1080p proxies for each chosen 360 highlight window.
 */
export type JobType = 'scan-root' | 'prepare' | 'proxy360' | 'signals' | 'curate' | 'highlights';

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
  /** Paused by the user. */
  paused: boolean;
  /** Paused automatically because macOS reported CPU throttling; clears itself. */
  thermalPaused: boolean;
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
  /** Ollama model tag used for frame grading (default qwen3.5:9b). */
  visionModel: string;
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
  /** Local model server state; `model` is the configured vision model and whether it is pulled. */
  ollama: { running: boolean; version?: string; models: string[]; model: string; modelAvailable: boolean };
  /** macOS Photos library detected on this Mac (path stays server-side). */
  photosLibrary: PhotosLibraryInfo;
}

export interface PhotosLibraryInfo {
  found: boolean;
  /** Display name, e.g. "Photos Library". */
  label?: string;
  /** The server can read the originals folder (macOS privacy permission granted). */
  readable: boolean;
  /** Already registered as a library root. */
  registeredRootId?: string;
}

// ---------------------------------------------------------------------------
// Stage-2 curation (local vision model)
// ---------------------------------------------------------------------------

export type FrameQuality = 'ok' | 'dark' | 'blur' | 'bright' | 'blocked';

/** What the vision model says about one frame. Validated and clamped on the server. */
export interface FrameGrade {
  /** 0–10, how well this exact moment would play in a fast travel montage. */
  interest: number;
  quality: FrameQuality;
  people: boolean;
  faces: boolean;
  /** 3–6 words. */
  scene: string;
  /** ≤ 10 words. */
  caption: string;
}

/** Which flat view to cut out of a 360 sphere for a highlight. */
export interface HighlightView {
  lens: 'a' | 'b';
  yawDeg: number;
  pitchDeg: number;
}

export interface HighlightWindow {
  /** Position in the record; used in ids and proxy filenames. */
  index: number;
  start: number;
  end: number;
  /** The graded frame time this window grew from. */
  sampleT: number;
  /** 0–1 fused score. */
  score: number;
  caption: string;
  scene: string;
  people: boolean;
  faces: boolean;
  /** 360 only: the yaw/lens the model preferred at sampleT. */
  view?: HighlightView;
  /** 360 only: the flat 1080p clip for this window. */
  proxy?: ProcessingState;
}

export interface CurationRecord {
  version: 1;
  itemId: string;
  kind: MediaKind;
  provider: string;
  model: string;
  createdAt: number;
  durationMs: number;
  /** 0–1 overall. */
  score: number;
  /** Photos: the thumbnail grade. Videos: the top highlight's grade summary. */
  grade?: FrameGrade;
  highlights: HighlightWindow[];
  stats: { sampled: number; graded: number; reused: number; candidates: number };
}

// ---------------------------------------------------------------------------
// Story layer (Phase 3)
// ---------------------------------------------------------------------------

/** The 12 template styles; the browser maps a style to its SmartTemplate id. */
export type StoryTemplateStyle = TemplateStyle;

export type StoryPacing = 'calm' | 'steady' | 'fast';
export type ShotRole = 'opener' | 'beat' | 'breather' | 'closer';

/** One shot the story is told with — a photo or one video highlight. Indices refer to this list. */
export interface StoryContextEntry {
  index: number;
  /** `itemId` or `itemId#highlightIndex`. */
  key: string;
  kind: MediaKind;
  /** Capture time, epoch ms (highlights: clip capture + offset). */
  at: number;
  caption?: string;
  scene?: string;
  people: boolean;
  faces: boolean;
  score: number;
  durationSec?: number;
}

export interface StoryContext {
  entries: StoryContextEntry[];
  startAt: number;
  endAt: number;
  dayCount: number;
}

export interface StoryChapter {
  title: string;
  startIndex: number;
  endIndex: number;
}

export interface StoryShot {
  index: number;
  role: ShotRole;
}

export interface StoryPlan {
  version: 1;
  source: 'model' | 'heuristic';
  model?: string;
  createdAt: number;
  /** The shots this plan was written for, in order (same keys as StoryContextEntry.key). */
  keys: string[];
  title: string;
  subtitle: string;
  chapters: StoryChapter[];
  templateStyle: StoryTemplateStyle;
  templateReasons: string[];
  pacing: StoryPacing;
  musicMood: string;
  shotList: StoryShot[];
}

/** One entry in a montage plan. */
export interface MontagePick {
  itemId: string;
  kind: MediaKind;
  /** Videos only: which highlight window. */
  highlightIndex?: number;
  start?: number;
  end?: number;
  /** 360 only: the flat highlight clip has been rendered. */
  highlightProxyReady?: boolean;
  score: number;
  caption?: string;
}
