/**
 * Post-Processing Stack — apply ordered visual effects to a rendered frame.
 *
 * Effects are composable: you stack multiple post-processing passes
 * and they apply in order (e.g., color grade → film grain → vignette → letterbox).
 */

import { clamp } from './easing';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PostEffectConfig {
  effect: string;
  intensity: number; // 0-1
  params?: Record<string, number | string>;
}

export type PostEffectFn = (
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  t: number,
  intensity: number,
  params?: Record<string, number | string>,
) => void;

// ---------------------------------------------------------------------------
// Color Grading
// ---------------------------------------------------------------------------

const COLOR_GRADES: Record<string, { filter: string; overlay?: string }> = {
  'warm-cinematic': {
    filter: 'contrast(1.1) saturate(1.2) sepia(0.15)',
    overlay: 'rgba(255,180,80,0.06)',
  },
  'cool-teal': {
    filter: 'contrast(1.05) saturate(0.9) hue-rotate(-10deg)',
    overlay: 'rgba(0,180,200,0.05)',
  },
  'vintage-fade': {
    filter: 'contrast(0.9) saturate(0.7) sepia(0.3) brightness(1.05)',
    overlay: 'rgba(200,180,120,0.08)',
  },
  'high-contrast': {
    filter: 'contrast(1.3) saturate(1.1) brightness(0.95)',
  },
  'pastel-dream': {
    filter: 'contrast(0.85) saturate(0.6) brightness(1.15)',
    overlay: 'rgba(200,150,255,0.04)',
  },
  'neon-night': {
    filter: 'contrast(1.2) saturate(1.5) brightness(0.9)',
    overlay: 'rgba(100,0,255,0.05)',
  },
  'bleach-bypass': {
    filter: 'contrast(1.25) saturate(0.5) brightness(0.95)',
  },
};

export const colorGrade: PostEffectFn = (ctx, width, height, _t, intensity, params) => {
  const preset = params?.preset as string || 'warm-cinematic';
  const grade = COLOR_GRADES[preset];
  if (!grade) return;

  // Apply filter
  ctx.filter = grade.filter;
  ctx.globalAlpha = intensity;
  ctx.drawImage(ctx.canvas, 0, 0);
  ctx.filter = 'none';
  ctx.globalAlpha = 1;

  // Apply overlay tint
  if (grade.overlay) {
    ctx.globalAlpha = intensity;
    ctx.fillStyle = grade.overlay;
    ctx.fillRect(0, 0, width, height);
    ctx.globalAlpha = 1;
  }
};

// ---------------------------------------------------------------------------
// Motion Blur
// ---------------------------------------------------------------------------

export const motionBlur: PostEffectFn = (ctx, width, height, _t, intensity) => {
  const blurAmount = 3 * intensity;
  if (blurAmount < 0.5) return;

  ctx.filter = `blur(${blurAmount}px)`;
  ctx.globalAlpha = 0.4 * intensity;
  ctx.drawImage(ctx.canvas, 2, 0);
  ctx.drawImage(ctx.canvas, -2, 0);
  ctx.filter = 'none';
  ctx.globalAlpha = 1;
};

// ---------------------------------------------------------------------------
// Film Grain (post-processing version)
// ---------------------------------------------------------------------------

export const filmGrainPost: PostEffectFn = (ctx, width, height, t, intensity) => {
  if (intensity < 0.05) return;

  const imageData = ctx.getImageData(0, 0, width, height);
  const data = imageData.data;
  const grainStrength = 20 * intensity;
  const seed = Math.floor(t * 10000);

  // Apply noise to every Nth pixel for performance
  const step = intensity > 0.5 ? 4 : 8;
  for (let i = 0; i < data.length; i += step) {
    const noise = ((seed + i * 13) % 256 - 128) * (grainStrength / 128);
    const pixIdx = (i >> 2) << 2; // Align to pixel boundary
    data[pixIdx] = clamp(data[pixIdx] + noise, 0, 255);
    data[pixIdx + 1] = clamp(data[pixIdx + 1] + noise, 0, 255);
    data[pixIdx + 2] = clamp(data[pixIdx + 2] + noise, 0, 255);
  }

  ctx.putImageData(imageData, 0, 0);
};

// ---------------------------------------------------------------------------
// Chromatic Aberration (post-processing version)
// ---------------------------------------------------------------------------

export const chromaticAberrationPost: PostEffectFn = (ctx, width, height, t, intensity) => {
  const offset = Math.sin(t * Math.PI) * 3 * intensity;
  if (Math.abs(offset) < 0.3) return;

  ctx.globalCompositeOperation = 'lighten';
  ctx.globalAlpha = 0.12 * intensity;
  ctx.drawImage(ctx.canvas, offset, 0, width, height);
  ctx.drawImage(ctx.canvas, -offset, 0, width, height);
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 1;
};

// ---------------------------------------------------------------------------
// Bloom (post-processing version)
// ---------------------------------------------------------------------------

export const bloomPost: PostEffectFn = (ctx, width, height, t, intensity) => {
  if (intensity < 0.1) return;

  ctx.globalCompositeOperation = 'screen';
  ctx.globalAlpha = 0.12 * intensity;
  ctx.filter = `blur(${10 * intensity}px) brightness(1.4)`;
  ctx.drawImage(ctx.canvas, 0, 0, width, height);
  ctx.filter = 'none';
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 1;
};

// ---------------------------------------------------------------------------
// Vignette Pulse
// ---------------------------------------------------------------------------

export const vignettePulse: PostEffectFn = (ctx, width, height, t, intensity) => {
  const cx = width / 2;
  const cy = height / 2;
  const maxR = Math.sqrt(cx * cx + cy * cy);
  const pulse = 0.7 + Math.sin(t * Math.PI * 2) * 0.1;
  const innerR = maxR * (0.4 + (1 - intensity) * 0.3) * pulse;

  const gradient = ctx.createRadialGradient(cx, cy, innerR, cx, cy, maxR);
  gradient.addColorStop(0, 'rgba(0,0,0,0)');
  gradient.addColorStop(1, `rgba(0,0,0,${0.6 * intensity})`);

  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);
};

// ---------------------------------------------------------------------------
// Letterbox (cinematic bars)
// ---------------------------------------------------------------------------

export const letterbox: PostEffectFn = (ctx, width, height, _t, intensity) => {
  const barHeight = height * 0.08 * intensity;
  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, width, barHeight);
  ctx.fillRect(0, height - barHeight, width, barHeight);
};

// ---------------------------------------------------------------------------
// Scanlines (retro CRT effect)
// ---------------------------------------------------------------------------

export const scanlines: PostEffectFn = (ctx, width, height, t, intensity) => {
  if (intensity < 0.05) return;

  const offset = Math.floor(t * 4) % 2;
  ctx.fillStyle = `rgba(0,0,0,${0.08 * intensity})`;

  for (let y = offset; y < height; y += 3) {
    ctx.fillRect(0, y, width, 1);
  }
};

// ---------------------------------------------------------------------------
// Light Leak (post-processing version)
// ---------------------------------------------------------------------------

export const lightLeakPost: PostEffectFn = (ctx, width, height, t, intensity) => {
  const leakX = Math.sin(t * Math.PI) * width * 0.3 + width * 0.5;
  const gradient = ctx.createRadialGradient(leakX, height * 0.3, 0, leakX, height * 0.3, width * 0.5);
  gradient.addColorStop(0, `rgba(255,180,80,${0.15 * intensity})`);
  gradient.addColorStop(0.5, `rgba(255,100,50,${0.08 * intensity})`);
  gradient.addColorStop(1, 'rgba(255,100,50,0)');

  ctx.globalCompositeOperation = 'screen';
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);
  ctx.globalCompositeOperation = 'source-over';
};

// ---------------------------------------------------------------------------
// Lens Flare (post-processing version)
// ---------------------------------------------------------------------------

export const lensFlarePost: PostEffectFn = (ctx, width, height, t, intensity) => {
  const flareX = (Math.sin(t * Math.PI * 0.5) * 0.5 + 0.5) * width;
  const flareY = height * 0.25;
  const size = 150 * intensity;

  const gradient = ctx.createRadialGradient(flareX, flareY, 0, flareX, flareY, size);
  gradient.addColorStop(0, `rgba(255,250,220,${0.35 * intensity})`);
  gradient.addColorStop(0.3, `rgba(255,220,150,${0.15 * intensity})`);
  gradient.addColorStop(1, 'rgba(255,200,100,0)');

  ctx.globalCompositeOperation = 'screen';
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);
  ctx.globalCompositeOperation = 'source-over';
};

// ---------------------------------------------------------------------------
// Static Vignette (non-pulsing)
// ---------------------------------------------------------------------------

export const vignette: PostEffectFn = (ctx, width, height, _t, intensity) => {
  const cx = width / 2;
  const cy = height / 2;
  const maxR = Math.sqrt(cx * cx + cy * cy);
  const innerR = maxR * (0.5 + (1 - intensity) * 0.3);

  const gradient = ctx.createRadialGradient(cx, cy, innerR, cx, cy, maxR);
  gradient.addColorStop(0, 'rgba(0,0,0,0)');
  gradient.addColorStop(1, `rgba(0,0,0,${0.5 * intensity})`);

  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);
};

// ---------------------------------------------------------------------------
// Post-Processing Registry
// ---------------------------------------------------------------------------

export const POST_EFFECT_MAP: Record<string, PostEffectFn> = {
  'color-grade': colorGrade,
  'motion-blur': motionBlur,
  'film-grain': filmGrainPost,
  'chromatic-aberration': chromaticAberrationPost,
  'bloom': bloomPost,
  'vignette-pulse': vignettePulse,
  'vignette': vignette,
  'letterbox': letterbox,
  'scanlines': scanlines,
  'light-leak': lightLeakPost,
  'lens-flare': lensFlarePost,
};

/**
 * Get a post-processing function by name.
 */
export function getPostEffect(name: string): PostEffectFn | undefined {
  return POST_EFFECT_MAP[name];
}

/**
 * Apply a stack of post-processing effects in order.
 */
export function applyPostStack(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  t: number,
  stack: PostEffectConfig[],
): void {
  for (const config of stack) {
    const fn = getPostEffect(config.effect);
    if (fn && config.intensity > 0) {
      fn(ctx, width, height, t, config.intensity, config.params);
    }
  }
}
