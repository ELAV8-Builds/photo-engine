/**
 * Transition Overlays — VFX clips composited between shots.
 *
 * Built-in overlays are procedurally generated (no external assets needed).
 * Users can also upload their own video/image-sequence overlays.
 *
 * Each overlay is rendered as a function that draws to canvas at a given
 * progress (0-1), using the specified blend mode.
 */

import type { TransitionOverlayConfig } from '@/types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type OverlayRenderFn = (
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  width: number,
  height: number,
  progress: number, // 0-1
) => void;

export interface OverlayDefinition {
  id: string;
  name: string;
  category: 'light' | 'particle' | 'geometric' | 'organic';
  defaultBlendMode: GlobalCompositeOperation;
  render: OverlayRenderFn;
}

// ---------------------------------------------------------------------------
// Built-in Procedural Overlays
// ---------------------------------------------------------------------------

const lightLeak: OverlayRenderFn = (ctx, w, h, t) => {
  // Animated warm light leak sweeping across
  const x = w * (t * 1.4 - 0.2);
  const gradient = ctx.createRadialGradient(x, h * 0.5, 0, x, h * 0.5, w * 0.6);
  gradient.addColorStop(0, `rgba(255, 200, 100, ${0.8 * Math.sin(t * Math.PI)})`);
  gradient.addColorStop(0.3, `rgba(255, 150, 50, ${0.4 * Math.sin(t * Math.PI)})`);
  gradient.addColorStop(0.6, `rgba(255, 100, 0, ${0.15 * Math.sin(t * Math.PI)})`);
  gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, w, h);
};

const flashBang: OverlayRenderFn = (ctx, w, h, t) => {
  // Quick white flash that peaks in the middle
  const intensity = t < 0.5
    ? Math.pow(t * 2, 0.5)
    : Math.pow(1 - (t - 0.5) * 2, 2);
  ctx.fillStyle = `rgba(255, 255, 255, ${intensity * 0.9})`;
  ctx.fillRect(0, 0, w, h);
};

const inkBlot: OverlayRenderFn = (ctx, w, h, t) => {
  // Expanding ink blot from center
  const maxRadius = Math.sqrt(w * w + h * h) / 2;
  const radius = maxRadius * Math.pow(t, 0.6);

  ctx.fillStyle = '#000';
  ctx.beginPath();
  // Multiple overlapping circles for organic feel
  for (let i = 0; i < 5; i++) {
    const angle = (i / 5) * Math.PI * 2;
    const offset = radius * 0.15;
    const cx = w / 2 + Math.cos(angle) * offset * Math.sin(t * Math.PI);
    const cy = h / 2 + Math.sin(angle) * offset * Math.sin(t * Math.PI);
    ctx.moveTo(cx + radius * 0.7, cy);
    ctx.arc(cx, cy, radius * 0.7, 0, Math.PI * 2);
  }
  ctx.fill();
};

const sparkShower: OverlayRenderFn = (ctx, w, h, t) => {
  // Falling sparks/particles
  const sparkCount = 40;
  const seed = 42;
  for (let i = 0; i < sparkCount; i++) {
    const hash = (i * 7919 + seed) % 1000 / 1000;
    const hash2 = (i * 6271 + seed) % 1000 / 1000;
    const hash3 = (i * 3571 + seed) % 1000 / 1000;

    const x = hash * w;
    const startY = -20 + hash2 * h * 0.3;
    const y = startY + t * (h * 1.5) * (0.5 + hash3 * 0.5);
    const size = 2 + hash3 * 4;
    const alpha = Math.max(0, Math.sin(t * Math.PI) * (0.5 + hash * 0.5));

    const r = 255;
    const g = Math.floor(180 + hash2 * 75);
    const b = Math.floor(50 + hash * 100);

    ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${alpha})`;
    ctx.beginPath();
    ctx.arc(x, y, size, 0, Math.PI * 2);
    ctx.fill();

    // Spark trail
    ctx.strokeStyle = `rgba(${r}, ${g}, ${b}, ${alpha * 0.3})`;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x, y - size * 5 * (0.5 + hash2 * 0.5));
    ctx.stroke();
  }
};

const prismSplit: OverlayRenderFn = (ctx, w, h, t) => {
  // RGB channel split / chromatic aberration overlay
  const offset = Math.sin(t * Math.PI) * w * 0.05;
  const alpha = Math.sin(t * Math.PI) * 0.4;

  // Red channel shifted left
  ctx.fillStyle = `rgba(255, 0, 0, ${alpha})`;
  ctx.fillRect(-offset, 0, w, h);

  // Blue channel shifted right
  ctx.fillStyle = `rgba(0, 0, 255, ${alpha})`;
  ctx.fillRect(offset, 0, w, h);
};

const radialWipe: OverlayRenderFn = (ctx, w, h, t) => {
  // Radial iris wipe with golden glow edge
  const cx = w / 2;
  const cy = h / 2;
  const maxRadius = Math.sqrt(w * w + h * h) / 2;
  const radius = maxRadius * (1 - t);

  // Glow ring at the edge
  const ringWidth = maxRadius * 0.05;
  const gradient = ctx.createRadialGradient(cx, cy, Math.max(0, radius - ringWidth), cx, cy, radius + ringWidth);
  gradient.addColorStop(0, 'rgba(0, 0, 0, 0)');
  gradient.addColorStop(0.3, `rgba(255, 200, 100, ${0.6 * Math.sin(t * Math.PI)})`);
  gradient.addColorStop(0.5, `rgba(255, 255, 255, ${0.8 * Math.sin(t * Math.PI)})`);
  gradient.addColorStop(0.7, `rgba(255, 200, 100, ${0.6 * Math.sin(t * Math.PI)})`);
  gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');

  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, w, h);
};

const filmBurn: OverlayRenderFn = (ctx, w, h, t) => {
  // Simulates film burn / overexposure at the edges
  const intensity = Math.sin(t * Math.PI);

  // Top-right burn
  const g1 = ctx.createRadialGradient(w * 0.8, h * 0.2, 0, w * 0.8, h * 0.2, w * 0.5);
  g1.addColorStop(0, `rgba(255, 200, 100, ${intensity * 0.6})`);
  g1.addColorStop(0.4, `rgba(255, 150, 50, ${intensity * 0.3})`);
  g1.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = g1;
  ctx.fillRect(0, 0, w, h);

  // Bottom-left burn
  const g2 = ctx.createRadialGradient(w * 0.2, h * 0.8, 0, w * 0.2, h * 0.8, w * 0.4);
  g2.addColorStop(0, `rgba(255, 100, 50, ${intensity * 0.4})`);
  g2.addColorStop(0.5, `rgba(255, 50, 0, ${intensity * 0.2})`);
  g2.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = g2;
  ctx.fillRect(0, 0, w, h);
};

const glitchWave: OverlayRenderFn = (ctx, w, h, t) => {
  // Horizontal glitch bars
  const barCount = 8;
  const intensity = Math.sin(t * Math.PI);

  for (let i = 0; i < barCount; i++) {
    const hash = ((i * 7919 + 137) % 1000) / 1000;
    const barY = hash * h;
    const barH = 3 + hash * 15;
    const offset = (hash - 0.5) * w * 0.2 * intensity;
    const alpha = intensity * (0.3 + hash * 0.5);

    // RGB shift bars
    ctx.fillStyle = `rgba(255, 0, 100, ${alpha * 0.6})`;
    ctx.fillRect(offset, barY, w, barH);
    ctx.fillStyle = `rgba(0, 200, 255, ${alpha * 0.4})`;
    ctx.fillRect(-offset, barY + barH * 0.3, w, barH * 0.6);
  }
};

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

export const OVERLAY_REGISTRY: OverlayDefinition[] = [
  { id: 'light-leak', name: 'Light Leak', category: 'light', defaultBlendMode: 'screen', render: lightLeak },
  { id: 'flash-bang', name: 'Flash Bang', category: 'light', defaultBlendMode: 'screen', render: flashBang },
  { id: 'ink-blot', name: 'Ink Blot', category: 'organic', defaultBlendMode: 'multiply', render: inkBlot },
  { id: 'spark-shower', name: 'Spark Shower', category: 'particle', defaultBlendMode: 'screen', render: sparkShower },
  { id: 'prism-split', name: 'Prism Split', category: 'light', defaultBlendMode: 'screen', render: prismSplit },
  { id: 'radial-wipe', name: 'Radial Wipe', category: 'geometric', defaultBlendMode: 'screen', render: radialWipe },
  { id: 'film-burn', name: 'Film Burn', category: 'light', defaultBlendMode: 'screen', render: filmBurn },
  { id: 'glitch-wave', name: 'Glitch Wave', category: 'geometric', defaultBlendMode: 'screen', render: glitchWave },
];

/**
 * Get an overlay definition by ID.
 */
export function getOverlay(id: string): OverlayDefinition | undefined {
  return OVERLAY_REGISTRY.find(o => o.id === id);
}

/**
 * Render a transition overlay on top of the current canvas.
 * Should be called during transition rendering, with progress 0-1.
 */
export function renderTransitionOverlay(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  config: TransitionOverlayConfig,
  width: number,
  height: number,
  progress: number,
): void {
  const overlay = getOverlay(config.id);
  if (!overlay) return;

  const blendMode = config.blendMode ?? overlay.defaultBlendMode;
  const opacity = config.opacity ?? 0.8;

  ctx.save();
  ctx.globalCompositeOperation = blendMode;
  ctx.globalAlpha = opacity;

  overlay.render(ctx, width, height, progress);

  ctx.restore();
}

// ---------------------------------------------------------------------------
// User-uploaded overlay support (video file → frame extraction)
// ---------------------------------------------------------------------------

const customOverlayCache = new Map<string, HTMLVideoElement>();

/**
 * Register a user-uploaded overlay video.
 * Returns a custom overlay config that can be assigned to template slots.
 */
export function registerCustomOverlay(file: File): TransitionOverlayConfig {
  const url = URL.createObjectURL(file);
  const video = document.createElement('video');
  video.crossOrigin = 'anonymous';
  video.muted = true;
  video.preload = 'auto';
  video.src = url;
  video.load();

  const id = `custom-${Date.now()}`;
  customOverlayCache.set(id, video);

  return {
    id,
    blendMode: 'screen',
    opacity: 0.8,
  };
}

/**
 * Render a custom (user-uploaded) overlay by seeking the video to the right frame.
 */
export async function renderCustomOverlay(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  overlayId: string,
  width: number,
  height: number,
  progress: number,
  blendMode: GlobalCompositeOperation = 'screen',
  opacity: number = 0.8,
): Promise<void> {
  const video = customOverlayCache.get(overlayId);
  if (!video || !video.duration) return;

  // Seek to the right position
  const targetTime = progress * video.duration;
  if (Math.abs(video.currentTime - targetTime) > 0.05) {
    video.currentTime = targetTime;
    await new Promise<void>((resolve) => {
      video.addEventListener('seeked', () => resolve(), { once: true });
    });
  }

  ctx.save();
  ctx.globalCompositeOperation = blendMode;
  ctx.globalAlpha = opacity;

  // Draw video frame cover-fit
  const vw = video.videoWidth || width;
  const vh = video.videoHeight || height;
  const scale = Math.max(width / vw, height / vh);
  const dw = vw * scale;
  const dh = vh * scale;
  ctx.drawImage(video, (width - dw) / 2, (height - dh) / 2, dw, dh);

  ctx.restore();
}
