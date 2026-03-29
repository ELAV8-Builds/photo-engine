/**
 * Transition Effects Library — 15+ cinematic transitions.
 *
 * Each transition blends from sourceImg to destImg over t (0-1).
 * Draws the result onto ctx.
 */

import { getEasing, lerp, clamp } from './easing';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TransitionOpts {
  width: number;
  height: number;
  /** Easing function name */
  easing?: string;
  /** Transition intensity (0-1), default 1 */
  intensity?: number;
}

export type TransitionFn = (
  ctx: CanvasRenderingContext2D,
  srcImg: CanvasImageSource,
  dstImg: CanvasImageSource,
  t: number,
  opts: TransitionOpts,
) => void;

// ---------------------------------------------------------------------------
// Warp Transitions
// ---------------------------------------------------------------------------

/** Pixel displacement dissolve */
export const morphDissolve: TransitionFn = (ctx, src, dst, t, opts) => {
  const { width, height, easing } = opts;
  const ease = getEasing(easing || 'ease-in-out');
  const et = ease(t);

  // Draw destination
  ctx.drawImage(dst, 0, 0, width, height);

  // Draw source with decreasing opacity
  ctx.globalAlpha = 1 - et;
  ctx.drawImage(src, 0, 0, width, height);
  ctx.globalAlpha = 1;

  // Add a slight blur during the middle of the transition
  if (et > 0.2 && et < 0.8) {
    const blurAmount = (1 - Math.abs(et - 0.5) * 4) * 3;
    ctx.filter = `blur(${blurAmount}px)`;
    ctx.globalAlpha = 0.3;
    ctx.drawImage(ctx.canvas, 0, 0);
    ctx.filter = 'none';
    ctx.globalAlpha = 1;
  }
};

/** Circular reveal from center */
export const radialWipe: TransitionFn = (ctx, src, dst, t, opts) => {
  const { width, height, easing } = opts;
  const ease = getEasing(easing || 'ease-in-out');
  const et = ease(t);

  // Draw source
  ctx.drawImage(src, 0, 0, width, height);

  // Clip destination to circular region
  const maxRadius = Math.sqrt(width * width + height * height) / 2;
  const radius = et * maxRadius;

  ctx.save();
  ctx.beginPath();
  ctx.arc(width / 2, height / 2, radius, 0, Math.PI * 2);
  ctx.clip();
  ctx.drawImage(dst, 0, 0, width, height);
  ctx.restore();
};

/** Rotational reveal (clock hand) */
export const clockWipe: TransitionFn = (ctx, src, dst, t, opts) => {
  const { width, height, easing } = opts;
  const ease = getEasing(easing || 'linear');
  const et = ease(t);

  // Draw source
  ctx.drawImage(src, 0, 0, width, height);

  // Clip destination to pie-slice region
  const cx = width / 2;
  const cy = height / 2;
  const maxRadius = Math.sqrt(width * width + height * height);
  const angle = et * Math.PI * 2 - Math.PI / 2;

  ctx.save();
  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.lineTo(cx, 0); // Start at top
  ctx.arc(cx, cy, maxRadius, -Math.PI / 2, angle);
  ctx.closePath();
  ctx.clip();
  ctx.drawImage(dst, 0, 0, width, height);
  ctx.restore();
};

/** Classic film iris open/close */
export const irisWipe: TransitionFn = (ctx, src, dst, t, opts) => {
  const { width, height, easing } = opts;
  const ease = getEasing(easing || 'ease-in-out');
  const et = ease(t);

  // Draw source
  ctx.drawImage(src, 0, 0, width, height);

  // Diamond/iris shape
  const cx = width / 2;
  const cy = height / 2;
  const size = et * Math.max(width, height) * 0.8;

  ctx.save();
  ctx.beginPath();
  ctx.moveTo(cx, cy - size);
  ctx.lineTo(cx + size, cy);
  ctx.lineTo(cx, cy + size);
  ctx.lineTo(cx - size, cy);
  ctx.closePath();
  ctx.clip();
  ctx.drawImage(dst, 0, 0, width, height);
  ctx.restore();
};

/** Vertical/horizontal curtain pull */
export const curtain: TransitionFn = (ctx, src, dst, t, opts) => {
  const { width, height, easing } = opts;
  const ease = getEasing(easing || 'ease-in-out');
  const et = ease(t);

  // Draw destination
  ctx.drawImage(dst, 0, 0, width, height);

  // Draw source as two halves splitting apart
  const split = et * width / 2;

  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, width / 2 - split, height);
  ctx.clip();
  ctx.drawImage(src, 0, 0, width, height);
  ctx.restore();

  ctx.save();
  ctx.beginPath();
  ctx.rect(width / 2 + split, 0, width / 2 - split, height);
  ctx.clip();
  ctx.drawImage(src, 0, 0, width, height);
  ctx.restore();
};

// ---------------------------------------------------------------------------
// 3D-Style Transitions (Canvas 2D tricks)
// ---------------------------------------------------------------------------

/** Simulated page turn effect */
export const pageCurl: TransitionFn = (ctx, src, dst, t, opts) => {
  const { width, height, easing } = opts;
  const ease = getEasing(easing || 'ease-in-out');
  const et = ease(t);

  // Draw destination
  ctx.drawImage(dst, 0, 0, width, height);

  // Draw source with shrinking width (simulates page turning)
  const remainingWidth = width * (1 - et);
  if (remainingWidth > 1) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, remainingWidth, height);
    ctx.clip();

    // Slight skew for perspective
    const skew = et * 0.1;
    ctx.transform(1, skew, 0, 1 - skew * 0.5, 0, height * skew * 0.25);
    ctx.drawImage(src, 0, 0, width, height);

    // Shadow on the fold edge
    const gradient = ctx.createLinearGradient(remainingWidth - 30, 0, remainingWidth, 0);
    gradient.addColorStop(0, 'rgba(0,0,0,0)');
    gradient.addColorStop(1, `rgba(0,0,0,${0.3 * et})`);
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, remainingWidth, height);
    ctx.restore();
  }
};

/** Fake 3D cube rotation */
export const cubeRotate: TransitionFn = (ctx, src, dst, t, opts) => {
  const { width, height, easing } = opts;
  const ease = getEasing(easing || 'ease-in-out');
  const et = ease(t);

  if (et < 0.5) {
    // First half: source shrinks
    const scaleX = Math.cos(et * Math.PI);
    const xOffset = width * (1 - scaleX) / 2;
    ctx.save();
    ctx.translate(xOffset, 0);
    ctx.scale(scaleX, 1);
    ctx.drawImage(src, 0, 0, width, height);
    // Add shadow for depth
    ctx.fillStyle = `rgba(0,0,0,${et * 0.5})`;
    ctx.fillRect(0, 0, width, height);
    ctx.restore();
  } else {
    // Second half: destination grows
    const scaleX = Math.cos((1 - et) * Math.PI);
    const xOffset = width * (1 - scaleX) / 2;
    ctx.save();
    ctx.translate(xOffset, 0);
    ctx.scale(scaleX, 1);
    ctx.drawImage(dst, 0, 0, width, height);
    // Add shadow for depth
    ctx.fillStyle = `rgba(0,0,0,${(1 - et) * 0.5})`;
    ctx.fillRect(0, 0, width, height);
    ctx.restore();
  }
};

/** Horizontal flip with perspective */
export const flipCard: TransitionFn = (ctx, src, dst, t, opts) => {
  const { width, height, easing } = opts;
  const ease = getEasing(easing || 'ease-in-out');
  const et = ease(t);

  const angle = et * Math.PI;
  const scaleY = Math.abs(Math.cos(angle));

  ctx.save();
  ctx.translate(0, height * (1 - scaleY) / 2);
  ctx.scale(1, scaleY || 0.001);

  if (et < 0.5) {
    ctx.drawImage(src, 0, 0, width, height);
  } else {
    ctx.drawImage(dst, 0, 0, width, height);
  }
  ctx.restore();
};

/** Shatter into pieces */
export const shatter: TransitionFn = (ctx, src, dst, t, opts) => {
  const { width, height, easing } = opts;
  const ease = getEasing(easing || 'ease-in');
  const et = ease(t);

  // Draw destination behind
  ctx.drawImage(dst, 0, 0, width, height);

  if (et >= 1) return;

  // Draw source as grid of pieces that fall away
  const cols = 6;
  const rows = 4;
  const cellW = width / cols;
  const cellH = height / rows;

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const delay = (r * cols + c) / (rows * cols) * 0.5;
      const localT = clamp((et - delay) / (1 - delay), 0, 1);

      if (localT >= 1) continue;

      const sx = c * cellW;
      const sy = r * cellH;
      const fallY = localT * localT * height * 0.5;
      const rotation = localT * (c % 2 === 0 ? 1 : -1) * 0.3;
      const alpha = 1 - localT;

      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.translate(sx + cellW / 2, sy + cellH / 2 + fallY);
      ctx.rotate(rotation);
      ctx.drawImage(
        src as HTMLCanvasElement | HTMLImageElement,
        sx, sy, cellW, cellH,
        -cellW / 2, -cellH / 2, cellW, cellH,
      );
      ctx.restore();
    }
  }
  ctx.globalAlpha = 1;
};

/** Spiral dissolve */
export const swirl: TransitionFn = (ctx, src, dst, t, opts) => {
  const { width, height, easing } = opts;
  const ease = getEasing(easing || 'ease-in-out');
  const et = ease(t);

  // Draw destination
  ctx.drawImage(dst, 0, 0, width, height);

  // Draw source with rotation and shrinking
  ctx.save();
  ctx.globalAlpha = 1 - et;
  ctx.translate(width / 2, height / 2);
  ctx.rotate(et * Math.PI * 2);
  ctx.scale(1 - et * 0.5, 1 - et * 0.5);
  ctx.drawImage(src, -width / 2, -height / 2, width, height);
  ctx.restore();
  ctx.globalAlpha = 1;
};

// ---------------------------------------------------------------------------
// Energy Transitions
// ---------------------------------------------------------------------------

/** Fast horizontal blur wipe */
export const whipBlur: TransitionFn = (ctx, src, dst, t, opts) => {
  const { width, height } = opts;

  if (t < 0.4) {
    // Source with increasing blur
    const blur = (t / 0.4) * 20;
    ctx.filter = `blur(${blur}px)`;
    ctx.drawImage(src, 0, 0, width, height);
    ctx.filter = 'none';
  } else if (t > 0.6) {
    // Destination with decreasing blur
    const blur = ((1 - t) / 0.4) * 20;
    ctx.filter = `blur(${blur}px)`;
    ctx.drawImage(dst, 0, 0, width, height);
    ctx.filter = 'none';
  } else {
    // White flash in the middle
    const midT = (t - 0.4) / 0.2;
    ctx.filter = 'blur(20px)';
    ctx.drawImage(midT < 0.5 ? src : dst, 0, 0, width, height);
    ctx.filter = 'none';
    ctx.fillStyle = `rgba(255,255,255,${0.6 * (1 - Math.abs(midT - 0.5) * 2)})`;
    ctx.fillRect(0, 0, width, height);
  }
};

/** Flash to white */
export const flashWhite: TransitionFn = (ctx, src, dst, t, opts) => {
  const { width, height, easing } = opts;
  const ease = getEasing(easing || 'linear');
  const et = ease(t);

  if (et < 0.4) {
    ctx.drawImage(src, 0, 0, width, height);
    ctx.fillStyle = `rgba(255,255,255,${(et / 0.4)})`;
    ctx.fillRect(0, 0, width, height);
  } else if (et > 0.6) {
    ctx.drawImage(dst, 0, 0, width, height);
    ctx.fillStyle = `rgba(255,255,255,${(1 - et) / 0.4})`;
    ctx.fillRect(0, 0, width, height);
  } else {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);
  }
};

/** Flash to black */
export const flashBlack: TransitionFn = (ctx, src, dst, t, opts) => {
  const { width, height, easing } = opts;
  const ease = getEasing(easing || 'linear');
  const et = ease(t);

  if (et < 0.4) {
    ctx.drawImage(src, 0, 0, width, height);
    ctx.fillStyle = `rgba(0,0,0,${(et / 0.4)})`;
    ctx.fillRect(0, 0, width, height);
  } else if (et > 0.6) {
    ctx.drawImage(dst, 0, 0, width, height);
    ctx.fillStyle = `rgba(0,0,0,${(1 - et) / 0.4})`;
    ctx.fillRect(0, 0, width, height);
  } else {
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, width, height);
  }
};

/** RGB channel split wipe */
export const rgbSplitWipe: TransitionFn = (ctx, src, dst, t, opts) => {
  const { width, height, easing } = opts;
  const ease = getEasing(easing || 'ease-in-out');
  const et = ease(t);

  // Dissolve with RGB offset
  ctx.drawImage(dst, 0, 0, width, height);
  ctx.globalAlpha = 1 - et;

  const offset = Math.sin(et * Math.PI) * 10;
  ctx.drawImage(src, offset, 0, width, height);
  ctx.globalCompositeOperation = 'lighten';
  ctx.globalAlpha = (1 - et) * 0.5;
  ctx.drawImage(src, -offset, 0, width, height);
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 1;
};

/** Glitch block transition */
export const glitchBlocks: TransitionFn = (ctx, src, dst, t, opts) => {
  const { width, height } = opts;

  // Crossfade base
  ctx.drawImage(dst, 0, 0, width, height);
  ctx.globalAlpha = 1 - t;
  ctx.drawImage(src, 0, 0, width, height);
  ctx.globalAlpha = 1;

  // Add glitch blocks during middle of transition
  if (t > 0.2 && t < 0.8) {
    const glitchIntensity = 1 - Math.abs(t - 0.5) * 3.33;
    const numBlocks = Math.floor(glitchIntensity * 8);

    for (let i = 0; i < numBlocks; i++) {
      const blockW = 30 + ((i * 73) % 150);
      const blockH = 5 + ((i * 37) % 30);
      const blockX = ((i * 127 + Math.floor(t * 100)) % (width - blockW));
      const blockY = ((i * 89 + Math.floor(t * 200)) % (height - blockH));
      const srcX = blockX + ((i % 2 === 0 ? 1 : -1) * 10 * glitchIntensity);

      const sourceImg = i % 3 === 0 ? src : dst;
      ctx.drawImage(
        sourceImg as HTMLCanvasElement | HTMLImageElement,
        clamp(srcX, 0, width - blockW), blockY, blockW, blockH,
        blockX, blockY, blockW, blockH,
      );
    }
  }
};

/** Pixelate crossfade */
export const pixelateCrossfade: TransitionFn = (ctx, src, dst, t, opts) => {
  const { width, height, easing } = opts;
  const ease = getEasing(easing || 'ease-in-out');
  const et = ease(t);

  // Pixel size peaks in the middle
  const pixelSize = Math.max(1, Math.floor(20 * Math.sin(et * Math.PI)));

  if (pixelSize <= 1) {
    const img = et < 0.5 ? src : dst;
    ctx.drawImage(img, 0, 0, width, height);
    return;
  }

  // Draw at reduced resolution then scale up
  const img = et < 0.5 ? src : dst;
  const smallW = Math.max(1, Math.ceil(width / pixelSize));
  const smallH = Math.max(1, Math.ceil(height / pixelSize));

  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(img, 0, 0, smallW, smallH);
  ctx.drawImage(ctx.canvas, 0, 0, smallW, smallH, 0, 0, width, height);
  ctx.imageSmoothingEnabled = true;
};

// ---------------------------------------------------------------------------
// Legacy Transitions (backwards compatible)
// ---------------------------------------------------------------------------

/** Simple crossfade */
export const fade: TransitionFn = (ctx, src, dst, t, opts) => {
  const { width, height, easing } = opts;
  const ease = getEasing(easing || 'ease-in-out');
  const et = ease(t);
  ctx.drawImage(dst, 0, 0, width, height);
  ctx.globalAlpha = 1 - et;
  ctx.drawImage(src, 0, 0, width, height);
  ctx.globalAlpha = 1;
};

/** Slide left */
export const slideLeft: TransitionFn = (ctx, src, dst, t, opts) => {
  const { width, height, easing } = opts;
  const ease = getEasing(easing || 'ease-in-out');
  const et = ease(t);
  const offset = et * width;
  ctx.drawImage(src, -offset, 0, width, height);
  ctx.drawImage(dst, width - offset, 0, width, height);
};

/** Slide right */
export const slideRight: TransitionFn = (ctx, src, dst, t, opts) => {
  const { width, height, easing } = opts;
  const ease = getEasing(easing || 'ease-in-out');
  const et = ease(t);
  const offset = et * width;
  ctx.drawImage(src, offset, 0, width, height);
  ctx.drawImage(dst, -width + offset, 0, width, height);
};

/** Zoom in transition */
export const zoomIn: TransitionFn = (ctx, src, dst, t, opts) => {
  const { width, height, easing } = opts;
  const ease = getEasing(easing || 'ease-in-out');
  const et = ease(t);
  ctx.drawImage(dst, 0, 0, width, height);
  const scale = 1 + et * 0.5;
  const sw = width * scale;
  const sh = height * scale;
  ctx.globalAlpha = 1 - et;
  ctx.drawImage(src, (width - sw) / 2, (height - sh) / 2, sw, sh);
  ctx.globalAlpha = 1;
};

/** Zoom out transition */
export const zoomOut: TransitionFn = (ctx, src, dst, t, opts) => {
  const { width, height, easing } = opts;
  const ease = getEasing(easing || 'ease-in-out');
  const et = ease(t);
  ctx.drawImage(src, 0, 0, width, height);
  const scale = 0.5 + et * 0.5;
  const sw = width * scale;
  const sh = height * scale;
  ctx.globalAlpha = et;
  ctx.drawImage(dst, (width - sw) / 2, (height - sh) / 2, sw, sh);
  ctx.globalAlpha = 1;
};

/** Glitch transition (legacy) */
export const glitch: TransitionFn = (ctx, src, dst, t, opts) => {
  return glitchBlocks(ctx, src, dst, t, opts);
};

/** No transition */
export const none: TransitionFn = (ctx, _src, dst, _t, opts) => {
  const { width, height } = opts;
  ctx.drawImage(dst, 0, 0, width, height);
};

// ---------------------------------------------------------------------------
// Transition registry
// ---------------------------------------------------------------------------

export const TRANSITION_MAP: Record<string, TransitionFn> = {
  // Warp
  'morph-dissolve': morphDissolve,
  'radial-wipe': radialWipe,
  'clock-wipe': clockWipe,
  'iris-wipe': irisWipe,
  'curtain': curtain,
  // 3D-style
  'page-curl': pageCurl,
  'cube-rotate': cubeRotate,
  'flip-card': flipCard,
  'shatter': shatter,
  'swirl': swirl,
  // Energy
  'whip-blur': whipBlur,
  'flash-white': flashWhite,
  'flash-black': flashBlack,
  'rgb-split-wipe': rgbSplitWipe,
  'glitch-blocks': glitchBlocks,
  'pixelate-crossfade': pixelateCrossfade,
  // Legacy
  'fade': fade,
  'slide-left': slideLeft,
  'slide-right': slideRight,
  'zoom-in': zoomIn,
  'zoom-out': zoomOut,
  'glitch': glitch,
  'none': none,
};

/**
 * Get a transition function by name. Falls back to fade if not found.
 */
export function getTransition(name: string): TransitionFn {
  return TRANSITION_MAP[name] ?? fade;
}
