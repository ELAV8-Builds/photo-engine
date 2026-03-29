/**
 * Motion Effects Library — 20+ camera/dynamic/film effects.
 *
 * Each effect is a function that takes:
 * - ctx: CanvasRenderingContext2D (the output canvas)
 * - img: image source (canvas, image, or video frame)
 * - t: progress (0-1)
 * - opts: width, height, focal point, intensity
 *
 * Returns nothing — draws directly onto ctx.
 */

import { getEasing, lerp, clamp, pingPong, type EasingFn } from './easing';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface MotionOpts {
  width: number;
  height: number;
  /** Focal point X (0-1), default 0.5 */
  focalX?: number;
  /** Focal point Y (0-1), default 0.5 */
  focalY?: number;
  /** Effect intensity (0-1), default 0.7 */
  intensity?: number;
  /** Easing function name */
  easing?: string;
}

export type MotionFn = (
  ctx: CanvasRenderingContext2D,
  img: CanvasImageSource,
  t: number,
  opts: MotionOpts,
) => void;

// ---------------------------------------------------------------------------
// Helper: draw zoomed/panned image
// ---------------------------------------------------------------------------

function drawTransformed(
  ctx: CanvasRenderingContext2D,
  img: CanvasImageSource,
  w: number,
  h: number,
  scale: number,
  offsetX: number,
  offsetY: number,
) {
  const sw = w * scale;
  const sh = h * scale;
  const dx = (w - sw) / 2 + offsetX;
  const dy = (h - sh) / 2 + offsetY;
  ctx.drawImage(img, dx, dy, sw, sh);
}

// ---------------------------------------------------------------------------
// Camera Movements
// ---------------------------------------------------------------------------

/** Smooth zoom toward subject with cubic easing */
export const dollyIn: MotionFn = (ctx, img, t, opts) => {
  const { width, height, focalX = 0.5, focalY = 0.5, intensity = 0.7, easing } = opts;
  const ease = getEasing(easing || 'ease-in-out');
  const et = ease(t);
  const scale = 1 + et * 0.25 * intensity;
  const offsetX = (0.5 - focalX) * width * et * 0.3 * intensity;
  const offsetY = (0.5 - focalY) * height * et * 0.3 * intensity;
  drawTransformed(ctx, img, width, height, scale, offsetX, offsetY);
};

/** Pull back reveal with deceleration */
export const dollyOut: MotionFn = (ctx, img, t, opts) => {
  const { width, height, focalX = 0.5, focalY = 0.5, intensity = 0.7, easing } = opts;
  const ease = getEasing(easing || 'ease-out');
  const et = ease(t);
  const scale = 1.25 * intensity + 1 - et * 0.25 * intensity;
  const offsetX = (0.5 - focalX) * width * (1 - et) * 0.3 * intensity;
  const offsetY = (0.5 - focalY) * height * (1 - et) * 0.3 * intensity;
  drawTransformed(ctx, img, width, height, scale, offsetX, offsetY);
};

/** Circular pan around focus point */
export const orbit: MotionFn = (ctx, img, t, opts) => {
  const { width, height, intensity = 0.7 } = opts;
  const angle = t * Math.PI * 2;
  const radius = 20 * intensity;
  const offsetX = Math.cos(angle) * radius;
  const offsetY = Math.sin(angle) * radius;
  const scale = 1.08;
  drawTransformed(ctx, img, width, height, scale, offsetX, offsetY);
};

/** Vertical upward tilt */
export const craneUp: MotionFn = (ctx, img, t, opts) => {
  const { width, height, intensity = 0.7, easing } = opts;
  const ease = getEasing(easing || 'ease-in-out');
  const et = ease(t);
  const scale = 1.15;
  const offsetY = lerp(height * 0.1 * intensity, -height * 0.1 * intensity, et);
  drawTransformed(ctx, img, width, height, scale, 0, offsetY);
};

/** Vertical downward tilt */
export const craneDown: MotionFn = (ctx, img, t, opts) => {
  const { width, height, intensity = 0.7, easing } = opts;
  const ease = getEasing(easing || 'ease-in-out');
  const et = ease(t);
  const scale = 1.15;
  const offsetY = lerp(-height * 0.1 * intensity, height * 0.1 * intensity, et);
  drawTransformed(ctx, img, width, height, scale, 0, offsetY);
};

/** Fast horizontal swipe with motion blur */
export const whipPan: MotionFn = (ctx, img, t, opts) => {
  const { width, height, intensity = 0.7 } = opts;
  const scale = 1.1;

  // Fast movement in the middle of the effect
  const moveT = t < 0.3 ? 0 : t > 0.7 ? 1 : (t - 0.3) / 0.4;
  const easedMove = getEasing('snap')(moveT);
  const offsetX = lerp(-width * 0.15 * intensity, width * 0.15 * intensity, easedMove);

  // Motion blur during fast movement
  const blurAmount = Math.abs(moveT - 0.5) < 0.3 ? (1 - Math.abs(moveT - 0.5) / 0.3) * 8 * intensity : 0;

  if (blurAmount > 0.5) {
    ctx.filter = `blur(${blurAmount}px)`;
  }
  drawTransformed(ctx, img, width, height, scale, offsetX, 0);
  ctx.filter = 'none';
};

/** Simulated depth-of-field shift */
export const rackFocus: MotionFn = (ctx, img, t, opts) => {
  const { width, height, focalX = 0.5, focalY = 0.5, intensity = 0.7 } = opts;
  const scale = 1.05;

  // Start blurred, become sharp, end blurred
  const sharpness = 1 - Math.abs(t - 0.5) * 2;
  const blurAmount = (1 - sharpness) * 6 * intensity;

  drawTransformed(ctx, img, width, height, scale, 0, 0);

  // Draw a sharp circle around focal point
  if (blurAmount > 0.5) {
    const gradient = ctx.createRadialGradient(
      focalX * width, focalY * height, Math.min(width, height) * 0.15 * sharpness,
      focalX * width, focalY * height, Math.min(width, height) * 0.5,
    );
    gradient.addColorStop(0, 'rgba(0,0,0,0)');
    gradient.addColorStop(1, `rgba(0,0,0,${blurAmount * 0.03})`);
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);
  }
};

// ---------------------------------------------------------------------------
// Dynamic Effects
// ---------------------------------------------------------------------------

/** Variable speed effect (visual only — actual speed handled by speed-ramp) */
export const speedRamp: MotionFn = (ctx, img, t, opts) => {
  const { width, height, intensity = 0.7 } = opts;
  // Speed ramp adds a slight zoom pulse during fast sections
  const pulse = Math.sin(t * Math.PI * 4) * 0.02 * intensity;
  const scale = 1.05 + pulse;
  drawTransformed(ctx, img, width, height, scale, 0, 0);
};

/** Rhythmic zoom in/out */
export const pulseZoom: MotionFn = (ctx, img, t, opts) => {
  const { width, height, focalX = 0.5, focalY = 0.5, intensity = 0.7 } = opts;
  const pulse = Math.sin(t * Math.PI * 3) * 0.08 * intensity;
  const scale = 1.05 + pulse;
  const offsetX = (0.5 - focalX) * width * pulse * 2;
  const offsetY = (0.5 - focalY) * height * pulse * 2;
  drawTransformed(ctx, img, width, height, scale, offsetX, offsetY);
};

/** Subtle random wandering (handheld camera feel) */
export const drift: MotionFn = (ctx, img, t, opts) => {
  const { width, height, intensity = 0.7 } = opts;
  // Pseudo-random drift using sine waves at different frequencies
  const offsetX = (Math.sin(t * 7.3) * 5 + Math.sin(t * 13.7) * 3) * intensity;
  const offsetY = (Math.cos(t * 5.1) * 4 + Math.cos(t * 11.2) * 2) * intensity;
  const scale = 1.06 + Math.sin(t * 3.7) * 0.01 * intensity;
  drawTransformed(ctx, img, width, height, scale, offsetX, offsetY);
};

/** Selective blur creating miniature/tilt-shift effect */
export const tiltShift: MotionFn = (ctx, img, t, opts) => {
  const { width, height, intensity = 0.7, easing } = opts;
  const ease = getEasing(easing || 'ease-in-out');
  const et = ease(t);
  const scale = 1.05 + et * 0.05;
  drawTransformed(ctx, img, width, height, scale, 0, 0);

  // Add gradient blur overlay (top and bottom bands)
  const bandHeight = height * 0.25 * intensity;
  const gradient1 = ctx.createLinearGradient(0, 0, 0, bandHeight);
  gradient1.addColorStop(0, 'rgba(0,0,0,0.15)');
  gradient1.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = gradient1;
  ctx.fillRect(0, 0, width, bandHeight);

  const gradient2 = ctx.createLinearGradient(0, height - bandHeight, 0, height);
  gradient2.addColorStop(0, 'rgba(0,0,0,0)');
  gradient2.addColorStop(1, 'rgba(0,0,0,0.15)');
  ctx.fillStyle = gradient2;
  ctx.fillRect(0, height - bandHeight, width, bandHeight);
};

// ---------------------------------------------------------------------------
// Film Effects
// ---------------------------------------------------------------------------

/** Animated noise overlay */
export const filmGrain: MotionFn = (ctx, img, t, opts) => {
  const { width, height, intensity = 0.7 } = opts;
  drawTransformed(ctx, img, width, height, 1, 0, 0);

  // Draw grain
  const imageData = ctx.getImageData(0, 0, width, height);
  const data = imageData.data;
  const grainIntensity = 25 * intensity;
  const seed = Math.floor(t * 1000);

  // Simple PRNG-like grain using index-based noise
  for (let i = 0; i < data.length; i += 16) { // Process every 4th pixel for performance
    const noise = ((seed + i * 7) % 256 - 128) * (grainIntensity / 128);
    data[i] = clamp(data[i] + noise, 0, 255);
    data[i + 1] = clamp(data[i + 1] + noise, 0, 255);
    data[i + 2] = clamp(data[i + 2] + noise, 0, 255);
  }

  ctx.putImageData(imageData, 0, 0);
};

/** RGB channel offset that shifts during movement */
export const chromaticAberration: MotionFn = (ctx, img, t, opts) => {
  const { width, height, intensity = 0.7 } = opts;
  const offset = Math.sin(t * Math.PI) * 4 * intensity;

  // Draw image 3 times with color channel isolation
  ctx.globalCompositeOperation = 'source-over';
  drawTransformed(ctx, img, width, height, 1, 0, 0);

  // Red channel shift
  ctx.globalCompositeOperation = 'multiply';
  ctx.fillStyle = 'rgba(255,0,0,0.1)';
  ctx.fillRect(0, 0, width, height);

  ctx.globalCompositeOperation = 'lighten';
  ctx.save();
  ctx.translate(offset, 0);
  ctx.globalAlpha = 0.15 * intensity;
  drawTransformed(ctx, img, width, height, 1, 0, 0);
  ctx.restore();

  // Blue channel shift
  ctx.save();
  ctx.translate(-offset, 0);
  ctx.globalAlpha = 0.15 * intensity;
  drawTransformed(ctx, img, width, height, 1, 0, 0);
  ctx.restore();

  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 1;
};

/** Bright areas glow and bleed */
export const bloom: MotionFn = (ctx, img, t, opts) => {
  const { width, height, intensity = 0.7 } = opts;
  drawTransformed(ctx, img, width, height, 1, 0, 0);

  // Simulate bloom with a screen-composite brightened overlay
  ctx.globalCompositeOperation = 'screen';
  ctx.globalAlpha = 0.15 * intensity * (0.5 + Math.sin(t * Math.PI) * 0.5);
  ctx.filter = `blur(${12 * intensity}px) brightness(1.5)`;
  drawTransformed(ctx, img, width, height, 1, 0, 0);
  ctx.filter = 'none';
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 1;
};

/** Animated light streak across frame */
export const lensFlare: MotionFn = (ctx, img, t, opts) => {
  const { width, height, intensity = 0.7, easing } = opts;
  const ease = getEasing(easing || 'ease-in-out');
  drawTransformed(ctx, img, width, height, 1, 0, 0);

  // Animated light flare position
  const flareX = ease(t) * width * 1.4 - width * 0.2;
  const flareY = height * 0.35;
  const size = 120 * intensity;

  const gradient = ctx.createRadialGradient(flareX, flareY, 0, flareX, flareY, size);
  gradient.addColorStop(0, `rgba(255,240,200,${0.4 * intensity})`);
  gradient.addColorStop(0.3, `rgba(255,200,100,${0.2 * intensity})`);
  gradient.addColorStop(0.7, `rgba(255,150,50,${0.05 * intensity})`);
  gradient.addColorStop(1, 'rgba(255,150,50,0)');

  ctx.globalCompositeOperation = 'screen';
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);
  ctx.globalCompositeOperation = 'source-over';
};

/** Warm/cool color wash sweep */
export const lightLeak: MotionFn = (ctx, img, t, opts) => {
  const { width, height, intensity = 0.7 } = opts;
  drawTransformed(ctx, img, width, height, 1, 0, 0);

  const leakX = t * width * 1.5 - width * 0.25;
  const gradient = ctx.createLinearGradient(leakX - 100, 0, leakX + 200, height);
  gradient.addColorStop(0, 'rgba(255,100,50,0)');
  gradient.addColorStop(0.4, `rgba(255,150,50,${0.25 * intensity})`);
  gradient.addColorStop(0.6, `rgba(255,200,100,${0.2 * intensity})`);
  gradient.addColorStop(1, 'rgba(255,100,50,0)');

  ctx.globalCompositeOperation = 'screen';
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);
  ctx.globalCompositeOperation = 'source-over';
};

// ---------------------------------------------------------------------------
// Clone/Echo Effects
// ---------------------------------------------------------------------------

/** Previous frame ghosting */
export const echoTrail: MotionFn = (ctx, img, t, opts) => {
  const { width, height, intensity = 0.7 } = opts;
  // Dim existing content (ghost of previous frame)
  ctx.globalAlpha = 1 - 0.3 * intensity;
  ctx.fillStyle = 'rgba(0,0,0,0.15)';
  ctx.fillRect(0, 0, width, height);
  ctx.globalAlpha = 1;
  drawTransformed(ctx, img, width, height, 1, 0, 0);
};

/** Kaleidoscope/mirror with rotation */
export const mirror: MotionFn = (ctx, img, t, opts) => {
  const { width, height, intensity = 0.7 } = opts;
  const halfW = width / 2;

  // Draw left half normal
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, halfW, height);
  ctx.clip();
  const scale = 1.05 + Math.sin(t * Math.PI * 2) * 0.02 * intensity;
  drawTransformed(ctx, img, width, height, scale, 0, 0);
  ctx.restore();

  // Draw right half mirrored
  ctx.save();
  ctx.translate(width, 0);
  ctx.scale(-1, 1);
  ctx.beginPath();
  ctx.rect(0, 0, halfW, height);
  ctx.clip();
  drawTransformed(ctx, img, width, height, scale, 0, 0);
  ctx.restore();
};

/** Large pixels → full resolution reveal */
export const pixelateReveal: MotionFn = (ctx, img, t, opts) => {
  const { width, height, intensity = 0.7, easing } = opts;
  const ease = getEasing(easing || 'ease-out');
  const et = ease(t);

  // Start with large pixels, end with full resolution
  const maxPixelSize = 32 * intensity;
  const pixelSize = Math.max(1, Math.floor(maxPixelSize * (1 - et)));

  if (pixelSize <= 1) {
    drawTransformed(ctx, img, width, height, 1, 0, 0);
    return;
  }

  // Draw at reduced resolution
  const smallW = Math.max(1, Math.ceil(width / pixelSize));
  const smallH = Math.max(1, Math.ceil(height / pixelSize));

  ctx.imageSmoothingEnabled = false;

  // Draw small
  ctx.drawImage(img, 0, 0, smallW, smallH);
  // Scale back up (pixelated)
  ctx.drawImage(ctx.canvas, 0, 0, smallW, smallH, 0, 0, width, height);

  ctx.imageSmoothingEnabled = true;
};

// ---------------------------------------------------------------------------
// Legacy Effects (backwards compatible)
// ---------------------------------------------------------------------------

/** Classic Ken Burns: slow zoom toward focal point */
export const kenBurns: MotionFn = (ctx, img, t, opts) => {
  const { width, height, focalX = 0.5, focalY = 0.5, easing } = opts;
  const ease = getEasing(easing || 'ease-in-out');
  const et = ease(t);
  const scale = 1 + et * 0.15;
  const offsetX = (0.5 - focalX) * width * et * 0.15;
  const offsetY = (0.5 - focalY) * height * et * 0.15;
  drawTransformed(ctx, img, width, height, scale, offsetX, offsetY);
};

/** Slow zoom from center */
export const slowZoom: MotionFn = (ctx, img, t, opts) => {
  const { width, height, easing } = opts;
  const ease = getEasing(easing || 'linear');
  const et = ease(t);
  const scale = 1 + et * 0.1;
  drawTransformed(ctx, img, width, height, scale, 0, 0);
};

/** Subtle horizontal parallax */
export const parallax: MotionFn = (ctx, img, t, opts) => {
  const { width, height, easing } = opts;
  const ease = getEasing(easing || 'ease-in-out');
  const et = ease(t);
  const offsetX = (et - 0.5) * width * 0.08;
  drawTransformed(ctx, img, width, height, 1.06, offsetX, 0);
};

/** Pan left */
export const panLeft: MotionFn = (ctx, img, t, opts) => {
  const { width, height, easing } = opts;
  const ease = getEasing(easing || 'ease-in-out');
  const et = ease(t);
  const offsetX = (1 - et) * width * 0.08;
  drawTransformed(ctx, img, width, height, 1.08, offsetX, 0);
};

/** Pan right */
export const panRight: MotionFn = (ctx, img, t, opts) => {
  const { width, height, easing } = opts;
  const ease = getEasing(easing || 'ease-in-out');
  const et = ease(t);
  const offsetX = et * -width * 0.08;
  drawTransformed(ctx, img, width, height, 1.08, offsetX, 0);
};

/** Sine wave zoom bounce */
export const bounce: MotionFn = (ctx, img, t, opts) => {
  const { width, height } = opts;
  const scale = 1.05 + Math.sin(t * Math.PI * 2) * 0.03;
  drawTransformed(ctx, img, width, height, scale, 0, 0);
};

/** Static: no motion */
export const staticMotion: MotionFn = (ctx, img, _t, opts) => {
  const { width, height } = opts;
  drawTransformed(ctx, img, width, height, 1, 0, 0);
};

// ---------------------------------------------------------------------------
// Motion registry
// ---------------------------------------------------------------------------

export const MOTION_MAP: Record<string, MotionFn> = {
  // Camera
  'dolly-in': dollyIn,
  'dolly-out': dollyOut,
  'orbit': orbit,
  'crane-up': craneUp,
  'crane-down': craneDown,
  'whip-pan': whipPan,
  'rack-focus': rackFocus,
  // Dynamic
  'speed-ramp': speedRamp,
  'pulse-zoom': pulseZoom,
  'drift': drift,
  'tilt-shift': tiltShift,
  // Film
  'film-grain': filmGrain,
  'chromatic-aberration': chromaticAberration,
  'bloom': bloom,
  'lens-flare': lensFlare,
  'light-leak': lightLeak,
  // Clone/echo
  'echo-trail': echoTrail,
  'mirror': mirror,
  'pixelate-reveal': pixelateReveal,
  // Legacy
  'ken-burns': kenBurns,
  'slow-zoom': slowZoom,
  'parallax': parallax,
  'pan-left': panLeft,
  'pan-right': panRight,
  'bounce': bounce,
  'static': staticMotion,
};

/**
 * Get a motion function by name. Falls back to static if not found.
 */
export function getMotion(name: string): MotionFn {
  return MOTION_MAP[name] ?? staticMotion;
}
