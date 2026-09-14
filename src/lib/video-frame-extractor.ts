/**
 * Video Frame Extractor — extracts real frames from video elements at specific timestamps.
 *
 * Used in both preview and export to replace the static thumbnail approach.
 *
 * Two modes:
 * 1. createVideoPlayer(media) — returns a managed video element that can draw frames
 *    to a canvas at arbitrary timestamps (for preview animation loop)
 * 2. extractFrameAtTime(media, time) — single frame extraction as ImageBitmap
 *    (for export pipeline)
 */

import type { MediaFile } from '@/types';

// Cache of video elements keyed by media URL — reuse across renders
const videoCache = new Map<string, HTMLVideoElement>();

/**
 * Create or retrieve a cached HTMLVideoElement for a given media file.
 * The video is preloaded and ready for seeking.
 */
export function getVideoElement(media: MediaFile): Promise<HTMLVideoElement> {
  const key = media.url;
  const cached = videoCache.get(key);
  if (cached && cached.readyState >= 2) {
    return Promise.resolve(cached);
  }

  return new Promise((resolve, reject) => {
    const video = cached || document.createElement('video');
    video.crossOrigin = 'anonymous';
    video.preload = 'auto';
    video.muted = true; // Required for autoplay policies
    video.playsInline = true;

    const cleanup = () => {
      video.removeEventListener('loadeddata', onReady);
      video.removeEventListener('error', onError);
      clearTimeout(timer);
    };

    const onReady = () => {
      cleanup();
      videoCache.set(key, video);
      resolve(video);
    };

    const onError = () => {
      cleanup();
      reject(new Error(`Failed to load video: ${media.name}`));
    };

    // Never wait forever: a stalled element rejects so callers fall back to a still frame.
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error(`Timed out loading video: ${media.name}`));
    }, VIDEO_LOAD_TIMEOUT_MS);

    video.addEventListener('loadeddata', onReady);
    video.addEventListener('error', onError);

    if (!cached) {
      // Use file URL if available (blob URL), otherwise media URL
      if (media.file) {
        video.src = URL.createObjectURL(media.file);
      } else {
        video.src = media.url;
      }
    }
    // A cached element whose buffered data the browser has evicted (detached
    // elements in a long-lived tab) sits at readyState < 2 and never fires
    // `loadeddata` on its own — restart the fetch so it does.
    video.load();
  });
}

const VIDEO_LOAD_TIMEOUT_MS = 20_000;
/** A localhost Range seek completes in well under a second; anything past this is a stall, not a slow disk. */
export const SEEK_TIMEOUT_MS = 10_000;

/**
 * Seek a video element to a specific time and wait for the frame to be available.
 * Returns a promise that resolves when the frame is ready to draw.
 *
 * Phase 6: bounded. A seek whose `seeked` never fires (evicted element, dead
 * decoder, competing seeks) rejects after `timeoutMs` — as does a media error —
 * so an export fails visibly instead of hanging on one frame.
 */
export function seekToTime(video: HTMLVideoElement, time: number, timeoutMs = SEEK_TIMEOUT_MS): Promise<void> {
  return new Promise((resolve, reject) => {
    // If we're already at this time (within a frame), resolve immediately
    if (Math.abs(video.currentTime - time) < 0.02) {
      resolve();
      return;
    }

    const cleanup = () => {
      video.removeEventListener('seeked', onSeeked);
      video.removeEventListener('error', onError);
      clearTimeout(timer);
    };

    const onSeeked = () => {
      cleanup();
      resolve();
    };

    const onError = () => {
      cleanup();
      reject(new Error(`The video failed while seeking to ${time.toFixed(2)} s`));
    };

    const timer = setTimeout(() => {
      cleanup();
      reject(new Error(`No video frame arrived at ${time.toFixed(2)} s within ${Math.round(timeoutMs / 1000)} s — the browser stalled on this clip. Try the export again.`));
    }, timeoutMs);

    video.addEventListener('seeked', onSeeked);
    video.addEventListener('error', onError);
    video.currentTime = time;
  });
}

/**
 * Draw the current video frame to a canvas context with cover-fit.
 * The video must already be seeked to the desired time.
 */
export function drawVideoFrame(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  video: HTMLVideoElement,
  cw: number,
  ch: number,
): void {
  const vw = video.videoWidth || video.width;
  const vh = video.videoHeight || video.height;
  if (vw === 0 || vh === 0) return;

  const scale = Math.max(cw / vw, ch / vh);
  const dw = vw * scale;
  const dh = vh * scale;
  ctx.drawImage(video, (cw - dw) / 2, (ch - dh) / 2, dw, dh);
}

/**
 * Get the effective time within a video, respecting trimStart/trimEnd.
 *
 * @param progress - Normalized progress (0-1) within the template slot
 * @param media - The media file with optional trim properties
 * @returns The absolute time in the video to seek to
 */
export function getVideoTime(progress: number, media: MediaFile): number {
  const start = media.trimStart ?? 0;
  const end = media.trimEnd ?? (media.duration ?? 0);
  const duration = end - start;
  return start + progress * duration;
}

/**
 * A managed video source that can be used as a CanvasImageSource.
 * Wraps a <video> element with seeking + frame extraction.
 */
export interface VideoSource {
  readonly element: HTMLVideoElement;
  readonly media: MediaFile;
  /** Seek to a specific progress (0-1) and return the video element as image source */
  seekToProgress(progress: number): Promise<HTMLVideoElement>;
  /** Get the element directly (for use in engine.renderFrame imageMap) */
  asImageSource(): CanvasImageSource;
  /** Destroy and clean up resources */
  dispose(): void;
}

/**
 * Create a VideoSource for a media file.
 * This is the primary API for preview and export to use real video frames.
 */
export async function createVideoSource(media: MediaFile): Promise<VideoSource> {
  const video = await getVideoElement(media);

  // Seek to initial position (trimStart or 0)
  const initialTime = media.trimStart ?? 0;
  await seekToTime(video, initialTime);

  return {
    element: video,
    media,

    async seekToProgress(progress: number): Promise<HTMLVideoElement> {
      const time = getVideoTime(progress, media);
      await seekToTime(video, time);
      return video;
    },

    asImageSource(): CanvasImageSource {
      return video;
    },

    dispose(): void {
      // Don't destroy the video — it's cached for reuse
      // Just pause it
      video.pause();
    },
  };
}

/**
 * Load the appropriate image source for a media file.
 * - For photos: returns an HTMLImageElement (standard behavior)
 * - For videos: returns an HTMLVideoElement seeked to trimStart
 *
 * This is a drop-in replacement for loadMediaImage() that handles both types.
 */
export async function loadMediaSource(media: MediaFile): Promise<CanvasImageSource> {
  if (media.type === 'video') {
    const videoSource = await createVideoSource(media);
    return videoSource.asImageSource();
  }

  // Photo — standard image loading
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Failed to load image: ${media.name}`));
    img.src = media.url;
  });
}

/**
 * Clean up all cached video elements. Call on unmount.
 */
export function disposeAllVideos(): void {
  videoCache.forEach((video) => {
    video.pause();
    video.src = '';
    video.load();
  });
  videoCache.clear();
}
