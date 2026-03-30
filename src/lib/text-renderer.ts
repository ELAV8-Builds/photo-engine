/**
 * Canvas text overlay renderer for animated text during video export.
 *
 * Provides functions to draw text overlays with various animations
 * (fade-in, slide-up, typewriter, scale-pop, glitch-in, blur-in,
 *  bounce-in, wave, neon-flicker) and backdrop styles onto an
 * OffscreenCanvas or regular Canvas 2D context.
 */

import type { TextOverlay, TextBackdrop, TextOverlayOverride } from '@/types';
import type { CSSProperties } from 'react';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const FONT_FAMILY = 'Inter, system-ui, sans-serif';

/** Maps fontSize token to a fraction of canvas height (sized for impact) */
const FONT_SIZE_SCALE: Record<TextOverlay['fontSize'], number> = {
  sm: 0.04,
  md: 0.065,
  lg: 0.1,
  xl: 0.15,
};

/** Maps fontWeight token to a numeric CSS weight */
const FONT_WEIGHT_MAP: Record<TextOverlay['fontWeight'], number> = {
  normal: 400,
  bold: 700,
  black: 900,
};

/** Maps position token to a vertical fraction (0 = top, 1 = bottom) */
const POSITION_Y_MAP: Record<TextOverlay['position'], number> = {
  top: 0.15,
  center: 0.5,
  bottom: 0.85,
};

// ---------------------------------------------------------------------------
// Easing helpers
// ---------------------------------------------------------------------------

/** Simple ease-out for smooth deceleration */
function easeOut(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

/** Elastic ease-out for bouncy spring effect */
function elasticOut(t: number): number {
  const p = 0.3;
  return Math.pow(2, -10 * t) * Math.sin(((t - p / 4) * (2 * Math.PI)) / p) + 1;
}

/** Clamp a value between 0 and 1 */
function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

/**
 * Map a progress value within a sub-range [start, end] to a 0-1 value.
 * Returns 0 if progress < start, 1 if progress > end.
 */
function subProgress(progress: number, start: number, end: number): number {
  if (end <= start) return 1;
  return clamp01((progress - start) / (end - start));
}

// ---------------------------------------------------------------------------
// Pseudo-random for deterministic glitch (seeded from progress)
// ---------------------------------------------------------------------------

function pseudoRandom(seed: number): number {
  const x = Math.sin(seed * 12345.6789) * 43758.5453;
  return x - Math.floor(x);
}

// ---------------------------------------------------------------------------
// Helper: resolve font size in pixels
// ---------------------------------------------------------------------------

function resolveFontSize(fontSize: TextOverlay['fontSize'], canvasHeight: number): number {
  return Math.round(canvasHeight * (FONT_SIZE_SCALE[fontSize] ?? FONT_SIZE_SCALE.md));
}

// ---------------------------------------------------------------------------
// Helper: parse CSS color to RGBA components
// ---------------------------------------------------------------------------

function parseColor(color: string): { r: number; g: number; b: number; a: number } {
  // Handle common hex formats
  if (color.startsWith('#')) {
    const hex = color.slice(1);
    if (hex.length === 3) {
      return {
        r: parseInt(hex[0] + hex[0], 16),
        g: parseInt(hex[1] + hex[1], 16),
        b: parseInt(hex[2] + hex[2], 16),
        a: 1,
      };
    }
    if (hex.length >= 6) {
      return {
        r: parseInt(hex.slice(0, 2), 16),
        g: parseInt(hex.slice(2, 4), 16),
        b: parseInt(hex.slice(4, 6), 16),
        a: hex.length === 8 ? parseInt(hex.slice(6, 8), 16) / 255 : 1,
      };
    }
  }
  // Handle rgba(...) format
  const rgbaMatch = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);
  if (rgbaMatch) {
    return {
      r: parseInt(rgbaMatch[1]),
      g: parseInt(rgbaMatch[2]),
      b: parseInt(rgbaMatch[3]),
      a: rgbaMatch[4] !== undefined ? parseFloat(rgbaMatch[4]) : 1,
    };
  }
  // Default white
  return { r: 255, g: 255, b: 255, a: 1 };
}

// ---------------------------------------------------------------------------
// drawTextWithShadow
// ---------------------------------------------------------------------------

/**
 * Draw text with an optional glow / shadow effect.
 */
export function drawTextWithShadow(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  color: string,
  glowColor?: string,
  glowSize: number = 15,
): void {
  ctx.save();

  if (glowColor) {
    ctx.shadowColor = glowColor;
    ctx.shadowBlur = glowSize;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 0;
  }

  ctx.fillStyle = color;
  ctx.fillText(text, x, y);

  ctx.shadowColor = 'transparent';
  ctx.shadowBlur = 0;
  ctx.restore();
}

// ---------------------------------------------------------------------------
// measureTextWidth
// ---------------------------------------------------------------------------

export function measureTextWidth(
  ctx: CanvasRenderingContext2D,
  text: string,
  fontSize: number,
  fontWeight: number,
): number {
  ctx.save();
  ctx.font = `${fontWeight} ${fontSize}px ${FONT_FAMILY}`;
  const metrics = ctx.measureText(text);
  ctx.restore();
  return metrics.width;
}

// ---------------------------------------------------------------------------
// Helper: draw rounded rect (with fallback)
// ---------------------------------------------------------------------------

function drawRoundRect(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number,
  radius: number | number[],
): void {
  const r = typeof radius === 'number' ? radius : radius[0] ?? 0;
  ctx.beginPath();
  if (typeof ctx.roundRect === 'function') {
    ctx.roundRect(x, y, w, h, radius);
  } else {
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.arcTo(x + w, y, x + w, y + r, r);
    ctx.lineTo(x + w, y + h - r);
    ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
    ctx.lineTo(x + r, y + h);
    ctx.arcTo(x, y + h, x, y + h - r, r);
    ctx.lineTo(x, y + r);
    ctx.arcTo(x, y, x + r, y, r);
    ctx.closePath();
  }
}

// ---------------------------------------------------------------------------
// Backdrop renderer (canvas)
// ---------------------------------------------------------------------------

function drawBackdrop(
  ctx: CanvasRenderingContext2D,
  backdrop: TextBackdrop | undefined,
  overlay: TextOverlay,
  baseX: number,
  baseY: number,
  textWidth: number,
  fontSize: number,
  animOpacity: number,
): void {
  const bd = backdrop ?? 'none';
  if (bd === 'none') {
    // Default: subtle dark plate
    const plateH = fontSize * 1.6;
    const plateW = textWidth + fontSize * 1.5;
    const plateX = baseX - plateW / 2;
    const plateY = baseY - plateH / 2;
    ctx.fillStyle = `rgba(0, 0, 0, ${0.35 * animOpacity})`;
    drawRoundRect(ctx, plateX, plateY, plateW, plateH, fontSize * 0.25);
    ctx.fill();
    return;
  }

  const padX = fontSize * 0.8;
  const padY = fontSize * 0.4;
  const w = textWidth + padX * 2;
  const h = fontSize * 1.8;
  const x = baseX - w / 2;
  const y = baseY - h / 2;
  const { r, g, b } = parseColor(overlay.color);

  ctx.save();
  ctx.globalAlpha = animOpacity;

  switch (bd) {
    case 'pill': {
      // Rounded pill (like iMessage bubble)
      const radius = h / 2;
      drawRoundRect(ctx, x, y, w, h, radius);
      ctx.fillStyle = `rgba(${r}, ${g}, ${b}, 0.2)`;
      ctx.fill();
      ctx.strokeStyle = `rgba(${r}, ${g}, ${b}, 0.5)`;
      ctx.lineWidth = 2;
      ctx.stroke();
      break;
    }

    case 'glass': {
      // Frosted glassmorphism
      drawRoundRect(ctx, x, y, w, h, fontSize * 0.35);
      ctx.fillStyle = `rgba(255, 255, 255, 0.08)`;
      ctx.fill();
      ctx.strokeStyle = `rgba(255, 255, 255, 0.2)`;
      ctx.lineWidth = 1;
      ctx.stroke();
      // Inner highlight
      drawRoundRect(ctx, x + 1, y + 1, w - 2, h * 0.4, [fontSize * 0.35, fontSize * 0.35, 0, 0]);
      ctx.fillStyle = `rgba(255, 255, 255, 0.06)`;
      ctx.fill();
      break;
    }

    case 'neon-box': {
      // Neon-lit border box
      const neonColor = overlay.glowColor || overlay.color;
      drawRoundRect(ctx, x, y, w, h, fontSize * 0.15);
      ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
      ctx.fill();
      // Neon glow border (draw multiple passes for glow)
      for (let pass = 0; pass < 3; pass++) {
        ctx.shadowColor = neonColor;
        ctx.shadowBlur = 8 + pass * 6;
        ctx.strokeStyle = neonColor;
        ctx.lineWidth = 2 - pass * 0.5;
        ctx.stroke();
      }
      ctx.shadowColor = 'transparent';
      ctx.shadowBlur = 0;
      break;
    }

    case 'gradient-bar': {
      // Horizontal gradient strip
      const grad = ctx.createLinearGradient(x, y, x + w, y);
      grad.addColorStop(0, `rgba(${r}, ${g}, ${b}, 0)`);
      grad.addColorStop(0.2, `rgba(${r}, ${g}, ${b}, 0.25)`);
      grad.addColorStop(0.5, `rgba(${r}, ${g}, ${b}, 0.3)`);
      grad.addColorStop(0.8, `rgba(${r}, ${g}, ${b}, 0.25)`);
      grad.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0)`);
      ctx.fillStyle = grad;
      ctx.fillRect(x - padX, y, w + padX * 2, h);
      break;
    }

    case 'cinematic-bar': {
      // Letterbox-style dark bar spanning full width
      const barH = h + padY * 2;
      const barY = baseY - barH / 2;
      const barGrad = ctx.createLinearGradient(0, barY, 0, barY + barH);
      barGrad.addColorStop(0, 'rgba(0, 0, 0, 0)');
      barGrad.addColorStop(0.15, 'rgba(0, 0, 0, 0.6)');
      barGrad.addColorStop(0.5, 'rgba(0, 0, 0, 0.7)');
      barGrad.addColorStop(0.85, 'rgba(0, 0, 0, 0.6)');
      barGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
      // Use full canvas width for the bar
      const cw = ctx.canvas.width;
      ctx.fillStyle = barGrad;
      ctx.fillRect(0, barY, cw, barH);
      break;
    }

    case 'tag': {
      // Small label/tag style
      const tagW = textWidth + padX * 1.2;
      const tagH = fontSize * 1.5;
      const tagX = baseX - tagW / 2;
      const tagY = baseY - tagH / 2;
      drawRoundRect(ctx, tagX, tagY, tagW, tagH, fontSize * 0.2);
      ctx.fillStyle = `rgba(${r}, ${g}, ${b}, 0.85)`;
      ctx.fill();
      // We need to change the text color to contrast with the tag
      // This is handled by the caller checking backdrop type
      break;
    }

    case 'outline': {
      // Text-stroke outline box, no fill
      drawRoundRect(ctx, x, y, w, h, fontSize * 0.2);
      ctx.strokeStyle = overlay.color;
      ctx.lineWidth = 2.5;
      ctx.stroke();
      break;
    }

    case 'shadow-block': {
      // Heavy drop-shadow block
      const blockW = textWidth + padX * 1.5;
      const blockH = fontSize * 1.6;
      const blockX = baseX - blockW / 2;
      const blockY = baseY - blockH / 2;
      // Shadow
      ctx.shadowColor = 'rgba(0, 0, 0, 0.6)';
      ctx.shadowBlur = fontSize * 0.3;
      ctx.shadowOffsetX = fontSize * 0.08;
      ctx.shadowOffsetY = fontSize * 0.08;
      drawRoundRect(ctx, blockX, blockY, blockW, blockH, fontSize * 0.15);
      ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
      ctx.fill();
      ctx.shadowColor = 'transparent';
      ctx.shadowBlur = 0;
      ctx.shadowOffsetX = 0;
      ctx.shadowOffsetY = 0;
      break;
    }
  }

  ctx.restore();
}

/**
 * For the 'tag' backdrop, the text color should be dark to contrast with
 * the colored background. Returns adjusted color or original.
 */
function getTextColorForBackdrop(overlay: TextOverlay): string {
  if (overlay.backdrop === 'tag') {
    // Use dark text on colored tag backgrounds
    const { r, g, b } = parseColor(overlay.color);
    // Simple luminance check
    const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    return lum > 0.5 ? '#000000' : '#ffffff';
  }
  return overlay.color;
}

// ---------------------------------------------------------------------------
// drawTextOverlay (main entry point)
// ---------------------------------------------------------------------------

/**
 * Draw an animated text overlay onto a canvas.
 *
 * @param ctx          - Canvas 2D rendering context
 * @param overlay      - TextOverlay descriptor (text, position, animation, etc.)
 * @param canvasWidth  - Width of the canvas in pixels
 * @param canvasHeight - Height of the canvas in pixels
 * @param progress     - Animation progress from 0 (start of slot) to 1 (end of slot)
 */
export function drawTextOverlay(
  ctx: CanvasRenderingContext2D,
  overlay: TextOverlay,
  canvasWidth: number,
  canvasHeight: number,
  progress: number,
): void {
  ctx.save();

  ctx.globalCompositeOperation = 'source-over';

  // Resolve font properties
  const fontSize = resolveFontSize(overlay.fontSize, canvasHeight);
  const fontWeight = FONT_WEIGHT_MAP[overlay.fontWeight] ?? 400;

  // Apply letter spacing
  const letterSpacing = overlay.letterSpacing !== undefined
    ? overlay.letterSpacing * fontSize * 0.05
    : (overlay.fontWeight === 'black' ? fontSize * 0.05 : fontSize * 0.02);

  // Set font and alignment
  ctx.font = `${fontWeight} ${fontSize}px ${FONT_FAMILY}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  (ctx as unknown as { letterSpacing: string }).letterSpacing = `${letterSpacing}px`;

  // Base position
  const baseX = canvasWidth / 2;
  const baseY = canvasHeight * (POSITION_Y_MAP[overlay.position] ?? 0.5);

  // Measure text for backdrop
  const textWidth = ctx.measureText(overlay.text).width;

  // Calculate animation opacity for backdrop fade
  const animOpacity = getAnimationOpacity(overlay.animation, progress);

  // Draw backdrop behind text
  drawBackdrop(ctx, overlay.backdrop, overlay, baseX, baseY, textWidth, fontSize, animOpacity);

  // Resolve text color based on backdrop
  const textColor = getTextColorForBackdrop(overlay);

  // Dispatch to per-animation renderer
  switch (overlay.animation) {
    case 'fade-in':
      renderFadeIn(ctx, { ...overlay, color: textColor }, baseX, baseY, progress);
      break;
    case 'slide-up':
      renderSlideUp(ctx, { ...overlay, color: textColor }, baseX, baseY, progress);
      break;
    case 'typewriter':
      renderTypewriter(ctx, { ...overlay, color: textColor }, baseX, baseY, progress);
      break;
    case 'scale-pop':
      renderScalePop(ctx, { ...overlay, color: textColor }, baseX, baseY, fontSize, progress);
      break;
    case 'glitch-in':
      renderGlitchIn(ctx, { ...overlay, color: textColor }, baseX, baseY, canvasWidth, fontSize, progress);
      break;
    case 'blur-in':
      renderBlurIn(ctx, { ...overlay, color: textColor }, baseX, baseY, progress);
      break;
    case 'bounce-in':
      renderBounceIn(ctx, { ...overlay, color: textColor }, baseX, baseY, fontSize, progress);
      break;
    case 'wave':
      renderWave(ctx, { ...overlay, color: textColor }, baseX, baseY, fontSize, progress);
      break;
    case 'neon-flicker':
      renderNeonFlicker(ctx, { ...overlay, color: textColor }, baseX, baseY, progress);
      break;
    case 'none':
    default:
      renderNone(ctx, { ...overlay, color: textColor }, baseX, baseY);
      break;
  }

  ctx.restore();
}

/**
 * Get the overall opacity for a given animation at a given progress,
 * used to sync backdrop fade with text animation.
 */
function getAnimationOpacity(animation: TextOverlay['animation'], progress: number): number {
  switch (animation) {
    case 'fade-in':
      if (progress < 0.15) return subProgress(progress, 0, 0.15);
      if (progress > 0.85) return 1 - subProgress(progress, 0.85, 1);
      return 1;
    case 'slide-up':
      if (progress < 0.2) return easeOut(subProgress(progress, 0, 0.2));
      if (progress > 0.8) return 1 - subProgress(progress, 0.8, 1);
      return 1;
    case 'typewriter':
      if (progress > 0.85) return 1 - subProgress(progress, 0.85, 1);
      return progress < 0.02 ? 0 : 1;
    case 'scale-pop':
      if (progress < 0.1) return easeOut(subProgress(progress, 0, 0.1));
      if (progress > 0.8) return 1 - subProgress(progress, 0.8, 1);
      return 1;
    case 'glitch-in':
      if (progress < 0.05) return 0;
      if (progress >= 0.9) return 0;
      if (progress < 0.15) return 0.6;
      if (progress < 0.2) return 0.8 + 0.2 * subProgress(progress, 0.15, 0.2);
      if (progress > 0.8) return 1 - subProgress(progress, 0.8, 0.9);
      return 1;
    case 'blur-in':
      if (progress < 0.2) return easeOut(subProgress(progress, 0, 0.2));
      if (progress > 0.85) return 1 - subProgress(progress, 0.85, 1);
      return 1;
    case 'bounce-in':
      if (progress < 0.25) return clamp01(subProgress(progress, 0, 0.1));
      if (progress > 0.8) return 1 - subProgress(progress, 0.8, 1);
      return 1;
    case 'wave':
      if (progress < 0.1) return subProgress(progress, 0, 0.1);
      if (progress > 0.85) return 1 - subProgress(progress, 0.85, 1);
      return 1;
    case 'neon-flicker':
      if (progress < 0.03) return 0;
      if (progress >= 0.9) return 0;
      return 0.8; // rough average during flicker phase
    case 'none':
    default:
      return 1;
  }
}

// ---------------------------------------------------------------------------
// Animation renderers
// ---------------------------------------------------------------------------

/** fade-in: smooth opacity ramp in/out */
function renderFadeIn(
  ctx: CanvasRenderingContext2D,
  overlay: TextOverlay,
  x: number,
  y: number,
  progress: number,
): void {
  let opacity: number;

  if (progress < 0.15) {
    opacity = subProgress(progress, 0, 0.15);
  } else if (progress > 0.85) {
    opacity = 1 - subProgress(progress, 0.85, 1);
  } else {
    opacity = 1;
  }

  ctx.globalAlpha = clamp01(opacity);
  drawTextWithShadow(ctx, overlay.text, x, y, overlay.color, overlay.glowColor);
}

/** slide-up: vertical offset + fade */
function renderSlideUp(
  ctx: CanvasRenderingContext2D,
  overlay: TextOverlay,
  x: number,
  baseY: number,
  progress: number,
): void {
  let opacity: number;
  let offsetY: number;

  if (progress < 0.2) {
    const t = easeOut(subProgress(progress, 0, 0.2));
    opacity = t;
    offsetY = 30 * (1 - t);
  } else if (progress > 0.8) {
    const t = subProgress(progress, 0.8, 1);
    opacity = 1 - t;
    offsetY = -20 * t;
  } else {
    opacity = 1;
    offsetY = 0;
  }

  ctx.globalAlpha = clamp01(opacity);
  drawTextWithShadow(ctx, overlay.text, x, baseY + offsetY, overlay.color, overlay.glowColor);
}

/** typewriter: characters revealed left-to-right with blinking cursor */
function renderTypewriter(
  ctx: CanvasRenderingContext2D,
  overlay: TextOverlay,
  x: number,
  y: number,
  progress: number,
): void {
  const fullText = overlay.text;
  let displayText: string;
  let opacity = 1;
  let showCursor = false;

  if (progress < 0.6) {
    const t = subProgress(progress, 0, 0.6);
    const visibleChars = Math.ceil(t * fullText.length);
    displayText = fullText.slice(0, visibleChars);
    // Blinking cursor during typing
    showCursor = Math.sin(progress * 60) > 0;
  } else if (progress > 0.85) {
    displayText = fullText;
    opacity = 1 - subProgress(progress, 0.85, 1);
  } else {
    displayText = fullText;
    // Occasional cursor blink while holding
    showCursor = progress < 0.7 && Math.sin(progress * 40) > 0.5;
  }

  ctx.globalAlpha = clamp01(opacity);
  const cursorStr = showCursor ? '|' : '';
  drawTextWithShadow(ctx, displayText + cursorStr, x, y, overlay.color, overlay.glowColor);
}

/** scale-pop: overshoot scale then settle */
function renderScalePop(
  ctx: CanvasRenderingContext2D,
  overlay: TextOverlay,
  x: number,
  y: number,
  _fontSize: number,
  progress: number,
): void {
  let scale: number;
  let opacity: number;

  if (progress < 0.1) {
    const t = easeOut(subProgress(progress, 0, 0.1));
    scale = 0.3 + t * (1.2 - 0.3);
    opacity = t;
  } else if (progress < 0.2) {
    const t = subProgress(progress, 0.1, 0.2);
    scale = 1.2 - t * 0.2;
    opacity = 1;
  } else if (progress > 0.8) {
    const t = subProgress(progress, 0.8, 1);
    scale = 1.0 - t * 0.2;
    opacity = 1 - t;
  } else {
    scale = 1;
    opacity = 1;
  }

  ctx.globalAlpha = clamp01(opacity);
  ctx.translate(x, y);
  ctx.scale(scale, scale);
  drawTextWithShadow(ctx, overlay.text, 0, 0, overlay.color, overlay.glowColor);
}

/** glitch-in: flicker with random offsets, then settle */
function renderGlitchIn(
  ctx: CanvasRenderingContext2D,
  overlay: TextOverlay,
  x: number,
  y: number,
  _canvasWidth: number,
  fontSize: number,
  progress: number,
): void {
  const maxOffset = fontSize * 0.5;
  const glitchCopies = 3;

  if (progress < 0.05) return;

  if (progress < 0.15) {
    const seed = Math.round(progress * 1000);
    for (let i = 0; i < glitchCopies; i++) {
      const r = pseudoRandom(seed + i * 7);
      const offsetX = (r - 0.5) * 2 * maxOffset;
      const glitchOpacity = 0.3 + pseudoRandom(seed + i * 13) * 0.7;

      ctx.globalAlpha = glitchOpacity;
      const useAltColor = pseudoRandom(seed + i * 19) > 0.5;
      const color = useAltColor ? shiftColor(overlay.color, seed + i) : overlay.color;
      drawTextWithShadow(ctx, overlay.text, x + offsetX, y, color, overlay.glowColor);
    }
    return;
  }

  if (progress < 0.2) {
    const t = subProgress(progress, 0.15, 0.2);
    const residualOffset = maxOffset * 0.3 * (1 - easeOut(t));
    const seed = Math.round(progress * 1000);
    const offsetX = (pseudoRandom(seed) - 0.5) * 2 * residualOffset;
    ctx.globalAlpha = 0.8 + 0.2 * t;
    drawTextWithShadow(ctx, overlay.text, x + offsetX, y, overlay.color, overlay.glowColor);
    return;
  }

  if (progress <= 0.8) {
    ctx.globalAlpha = 1;
    drawTextWithShadow(ctx, overlay.text, x, y, overlay.color, overlay.glowColor);
    return;
  }

  if (progress < 0.9) {
    const seed = Math.round(progress * 1000);
    const flickerT = subProgress(progress, 0.8, 0.9);
    for (let i = 0; i < glitchCopies; i++) {
      const r = pseudoRandom(seed + i * 7);
      const offsetX = (r - 0.5) * 2 * maxOffset * flickerT;
      const glitchOpacity = (1 - flickerT) * (0.3 + pseudoRandom(seed + i * 13) * 0.7);
      ctx.globalAlpha = clamp01(glitchOpacity);
      const useAltColor = pseudoRandom(seed + i * 19) > 0.5;
      const color = useAltColor ? shiftColor(overlay.color, seed + i) : overlay.color;
      drawTextWithShadow(ctx, overlay.text, x + offsetX, y, color, overlay.glowColor);
    }
    return;
  }
}

/** blur-in: text starts blurred and focuses sharp */
function renderBlurIn(
  ctx: CanvasRenderingContext2D,
  overlay: TextOverlay,
  x: number,
  y: number,
  progress: number,
): void {
  let opacity: number;
  let blur: number;

  if (progress < 0.2) {
    const t = easeOut(subProgress(progress, 0, 0.2));
    opacity = t;
    blur = (1 - t) * 12; // 12px -> 0px blur
  } else if (progress > 0.85) {
    const t = subProgress(progress, 0.85, 1);
    opacity = 1 - t;
    blur = t * 8; // blur back out
  } else {
    opacity = 1;
    blur = 0;
  }

  ctx.globalAlpha = clamp01(opacity);

  // Apply blur filter (supported in modern browsers)
  if (blur > 0.5) {
    ctx.filter = `blur(${blur}px)`;
  }
  drawTextWithShadow(ctx, overlay.text, x, y, overlay.color, overlay.glowColor);
  ctx.filter = 'none';
}

/** bounce-in: spring bounce from below */
function renderBounceIn(
  ctx: CanvasRenderingContext2D,
  overlay: TextOverlay,
  x: number,
  baseY: number,
  fontSize: number,
  progress: number,
): void {
  let offsetY: number;
  let opacity: number;

  if (progress < 0.25) {
    const t = subProgress(progress, 0, 0.25);
    const bounceT = elasticOut(t);
    offsetY = fontSize * 1.5 * (1 - bounceT); // bounces from below
    opacity = clamp01(t * 4); // quick fade in
  } else if (progress > 0.8) {
    const t = subProgress(progress, 0.8, 1);
    offsetY = -fontSize * 0.5 * easeOut(t); // slide up as it fades
    opacity = 1 - t;
  } else {
    offsetY = 0;
    opacity = 1;
  }

  ctx.globalAlpha = clamp01(opacity);
  drawTextWithShadow(ctx, overlay.text, x, baseY + offsetY, overlay.color, overlay.glowColor);
}

/** wave: per-letter wave animation */
function renderWave(
  ctx: CanvasRenderingContext2D,
  overlay: TextOverlay,
  baseX: number,
  baseY: number,
  fontSize: number,
  progress: number,
): void {
  let opacity: number;
  if (progress < 0.1) {
    opacity = subProgress(progress, 0, 0.1);
  } else if (progress > 0.85) {
    opacity = 1 - subProgress(progress, 0.85, 1);
  } else {
    opacity = 1;
  }

  ctx.globalAlpha = clamp01(opacity);
  ctx.textAlign = 'left';

  const text = overlay.text;
  // Measure total width centered
  const totalWidth = ctx.measureText(text).width;
  let curX = baseX - totalWidth / 2;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const charWidth = ctx.measureText(char).width;

    // Each letter oscillates with a phase offset
    const wavePhase = progress * Math.PI * 6 + i * 0.4;
    const waveAmplitude = fontSize * 0.15;
    const yOffset = Math.sin(wavePhase) * waveAmplitude;

    // Entrance: letters appear sequentially
    let charOpacity = 1;
    if (progress < 0.3) {
      const charDelay = (i / text.length) * 0.25;
      const charT = subProgress(progress, charDelay, charDelay + 0.1);
      charOpacity = charT;
    }

    ctx.globalAlpha = clamp01(opacity * charOpacity);
    drawTextWithShadow(ctx, char, curX + charWidth / 2, baseY + yOffset, overlay.color, overlay.glowColor);
    curX += charWidth;
  }

  // Reset alignment
  ctx.textAlign = 'center';
}

/** neon-flicker: neon sign turning on with flicker */
function renderNeonFlicker(
  ctx: CanvasRenderingContext2D,
  overlay: TextOverlay,
  x: number,
  y: number,
  progress: number,
): void {
  if (progress < 0.03) return;

  const neonColor = overlay.glowColor || overlay.color;
  let opacity: number;
  let glowIntensity: number;

  if (progress < 0.2) {
    // Flicker on phase
    const seed = Math.round(progress * 200);
    const flicker = pseudoRandom(seed);
    // More likely to be ON as we progress
    const onChance = subProgress(progress, 0.03, 0.2);
    const isOn = flicker < onChance;
    opacity = isOn ? (0.6 + flicker * 0.4) : 0.05;
    glowIntensity = isOn ? 20 + flicker * 15 : 2;
  } else if (progress > 0.85) {
    // Flicker off
    const seed = Math.round(progress * 200);
    const flicker = pseudoRandom(seed);
    const offChance = subProgress(progress, 0.85, 1);
    const isOn = flicker > offChance;
    opacity = isOn ? 1 : 0.05;
    glowIntensity = isOn ? 25 : 2;
  } else {
    // Steady glow with subtle pulse
    const pulse = Math.sin(progress * Math.PI * 8) * 0.05;
    opacity = 0.95 + pulse;
    glowIntensity = 25 + Math.sin(progress * Math.PI * 4) * 5;
  }

  ctx.globalAlpha = clamp01(opacity);
  drawTextWithShadow(ctx, overlay.text, x, y, overlay.color, neonColor, glowIntensity);
}

/** none: always visible, no animation */
function renderNone(
  ctx: CanvasRenderingContext2D,
  overlay: TextOverlay,
  x: number,
  y: number,
): void {
  ctx.globalAlpha = 1;
  drawTextWithShadow(ctx, overlay.text, x, y, overlay.color, overlay.glowColor);
}

// ---------------------------------------------------------------------------
// Glitch colour helper
// ---------------------------------------------------------------------------

function shiftColor(color: string, seed: number): string {
  const r = pseudoRandom(seed);
  if (r < 0.33) return '#ff0044';
  if (r < 0.66) return '#00ffff';
  return '#ff00ff';
}

// ---------------------------------------------------------------------------
// getTextPreviewCSS — DOM preview styles with animation CSS classes
// ---------------------------------------------------------------------------

/** Maps fontSize tokens to approximate CSS pixel values for DOM preview */
const PREVIEW_FONT_SIZES: Record<TextOverlay['fontSize'], number> = {
  sm: 14,
  md: 22,
  lg: 36,
  xl: 52,
};

/**
 * Returns CSS styles for DOM preview + a CSS animation class name.
 */
export function getTextPreviewCSS(overlay: TextOverlay): { style: CSSProperties; animationClass: string } {
  const fontSize = PREVIEW_FONT_SIZES[overlay.fontSize] ?? PREVIEW_FONT_SIZES.md;
  const fontWeight = FONT_WEIGHT_MAP[overlay.fontWeight] ?? 400;

  let top: string | undefined;
  let bottom: string | undefined;
  let transform = 'translateX(-50%)';

  switch (overlay.position) {
    case 'top':
      top = '15%';
      break;
    case 'bottom':
      bottom = '15%';
      break;
    case 'center':
    default:
      top = '50%';
      transform = 'translate(-50%, -50%)';
      break;
  }

  const textShadow = overlay.glowColor
    ? `0 0 15px ${overlay.glowColor}, 0 0 30px ${overlay.glowColor}`
    : '0 2px 4px rgba(0,0,0,0.9)';

  const letterSpacing = overlay.letterSpacing !== undefined
    ? `${overlay.letterSpacing * 0.05}em`
    : overlay.fontWeight === 'black' ? '0.05em' : '0.02em';

  const style: CSSProperties = {
    position: 'absolute',
    left: '50%',
    transform,
    fontSize,
    fontWeight,
    fontFamily: FONT_FAMILY,
    color: overlay.color,
    textAlign: 'center',
    whiteSpace: 'nowrap',
    pointerEvents: 'none',
    lineHeight: 1.2,
    letterSpacing,
    textTransform: overlay.fontWeight === 'black' ? 'uppercase' : 'none',
    ...(top !== undefined && { top }),
    ...(bottom !== undefined && { bottom }),
    textShadow,
  };

  // Map animation to CSS class
  const animationClass = `text-anim-${overlay.animation || 'none'}`;

  return { style, animationClass };
}

/**
 * Returns CSS styles for a text backdrop in DOM preview.
 */
export function getBackdropPreviewCSS(overlay: TextOverlay): CSSProperties | null {
  const bd = overlay.backdrop ?? 'none';
  if (bd === 'none') {
    // Default subtle plate
    return {
      background: 'rgba(0, 0, 0, 0.35)',
      borderRadius: '0.25em',
      padding: '0.3em 0.8em',
    };
  }

  const { r, g, b } = parseColor(overlay.color);

  switch (bd) {
    case 'pill':
      return {
        background: `rgba(${r}, ${g}, ${b}, 0.2)`,
        border: `2px solid rgba(${r}, ${g}, ${b}, 0.5)`,
        borderRadius: '999px',
        padding: '0.3em 1.2em',
      };

    case 'glass':
      return {
        background: 'rgba(255, 255, 255, 0.08)',
        backdropFilter: 'blur(10px)',
        WebkitBackdropFilter: 'blur(10px)',
        border: '1px solid rgba(255, 255, 255, 0.2)',
        borderRadius: '0.5em',
        padding: '0.4em 1em',
      };

    case 'neon-box':
      return {
        background: 'rgba(0, 0, 0, 0.5)',
        border: `2px solid ${overlay.glowColor || overlay.color}`,
        borderRadius: '0.2em',
        padding: '0.3em 0.8em',
        boxShadow: `0 0 8px ${overlay.glowColor || overlay.color}, 0 0 16px ${overlay.glowColor || overlay.color}, inset 0 0 8px ${overlay.glowColor || overlay.color}40`,
      };

    case 'gradient-bar':
      return {
        background: `linear-gradient(90deg, rgba(${r},${g},${b},0) 0%, rgba(${r},${g},${b},0.3) 20%, rgba(${r},${g},${b},0.3) 80%, rgba(${r},${g},${b},0) 100%)`,
        padding: '0.4em 2em',
        width: '100%',
      };

    case 'cinematic-bar':
      return {
        background: 'linear-gradient(180deg, rgba(0,0,0,0) 0%, rgba(0,0,0,0.65) 15%, rgba(0,0,0,0.7) 50%, rgba(0,0,0,0.65) 85%, rgba(0,0,0,0) 100%)',
        padding: '1.2em 2em',
        width: '100%',
      };

    case 'tag':
      return {
        background: `rgba(${r}, ${g}, ${b}, 0.85)`,
        color: (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.5 ? '#000' : '#fff',
        borderRadius: '0.25em',
        padding: '0.2em 0.6em',
        fontSize: '0.85em',
      };

    case 'outline':
      return {
        border: `2.5px solid ${overlay.color}`,
        borderRadius: '0.25em',
        padding: '0.3em 0.8em',
        background: 'transparent',
      };

    case 'shadow-block':
      return {
        background: 'rgba(0, 0, 0, 0.55)',
        borderRadius: '0.2em',
        padding: '0.3em 0.8em',
        boxShadow: '4px 4px 12px rgba(0,0,0,0.6)',
      };

    default:
      return null;
  }
}

/**
 * Generate CSS keyframes for text animations.
 * Call this once and inject into the page's <style> tag.
 */
export function getTextAnimationCSS(): string {
  return `
    /* Text animation keyframes */
    @keyframes textFadeIn {
      0% { opacity: 0; }
      15% { opacity: 1; }
      85% { opacity: 1; }
      100% { opacity: 0; }
    }
    @keyframes textSlideUp {
      0% { opacity: 0; transform: translate(-50%, -50%) translateY(30px); }
      20% { opacity: 1; transform: translate(-50%, -50%) translateY(0); }
      80% { opacity: 1; transform: translate(-50%, -50%) translateY(0); }
      100% { opacity: 0; transform: translate(-50%, -50%) translateY(-20px); }
    }
    @keyframes textTypewriter {
      0% { width: 0; }
      60% { width: 100%; }
      85% { width: 100%; opacity: 1; }
      100% { width: 100%; opacity: 0; }
    }
    @keyframes textScalePop {
      0% { opacity: 0; transform: translate(-50%, -50%) scale(0.3); }
      10% { opacity: 1; transform: translate(-50%, -50%) scale(1.2); }
      20% { transform: translate(-50%, -50%) scale(1); }
      80% { opacity: 1; transform: translate(-50%, -50%) scale(1); }
      100% { opacity: 0; transform: translate(-50%, -50%) scale(0.8); }
    }
    @keyframes textGlitchIn {
      0%, 5% { opacity: 0; }
      6% { opacity: 0.7; transform: translate(-50%, -50%) translateX(-8px); color: #ff0044; }
      8% { opacity: 0.5; transform: translate(-50%, -50%) translateX(5px); color: #00ffff; }
      10% { opacity: 0.8; transform: translate(-50%, -50%) translateX(-3px); }
      12% { opacity: 0.6; transform: translate(-50%, -50%) translateX(8px); color: #ff00ff; }
      15% { opacity: 1; transform: translate(-50%, -50%) translateX(2px); }
      20% { opacity: 1; transform: translate(-50%, -50%) translateX(0); }
      80% { opacity: 1; transform: translate(-50%, -50%) translateX(0); }
      85% { opacity: 0.7; transform: translate(-50%, -50%) translateX(-5px); }
      88% { opacity: 0.4; transform: translate(-50%, -50%) translateX(6px); }
      90% { opacity: 0; }
      100% { opacity: 0; }
    }
    @keyframes textBlurIn {
      0% { opacity: 0; filter: blur(12px); }
      20% { opacity: 1; filter: blur(0); }
      85% { opacity: 1; filter: blur(0); }
      100% { opacity: 0; filter: blur(8px); }
    }
    @keyframes textBounceIn {
      0% { opacity: 0; transform: translate(-50%, -50%) translateY(50px); }
      15% { opacity: 1; transform: translate(-50%, -50%) translateY(-15px); }
      22% { transform: translate(-50%, -50%) translateY(8px); }
      28% { transform: translate(-50%, -50%) translateY(-3px); }
      35% { transform: translate(-50%, -50%) translateY(0); }
      80% { opacity: 1; transform: translate(-50%, -50%) translateY(0); }
      100% { opacity: 0; transform: translate(-50%, -50%) translateY(-20px); }
    }
    @keyframes textWave {
      0% { opacity: 0; }
      10% { opacity: 1; }
      85% { opacity: 1; }
      100% { opacity: 0; }
    }
    @keyframes letterWave {
      0%, 100% { transform: translateY(0); }
      50% { transform: translateY(-0.15em); }
    }
    @keyframes textNeonFlicker {
      0%, 3% { opacity: 0; }
      4% { opacity: 0.7; }
      6% { opacity: 0.1; }
      8% { opacity: 0.8; }
      10% { opacity: 0.2; }
      12% { opacity: 0.9; }
      14% { opacity: 0.3; }
      16% { opacity: 0.95; }
      20% { opacity: 1; }
      80% { opacity: 1; }
      85% { opacity: 0.8; }
      87% { opacity: 0.1; }
      89% { opacity: 0.7; }
      91% { opacity: 0.05; }
      93% { opacity: 0.6; }
      95% { opacity: 0; }
      100% { opacity: 0; }
    }

    /* Animation classes */
    .text-anim-fade-in { animation: textFadeIn 4s ease-in-out forwards; }
    .text-anim-slide-up { animation: textSlideUp 4s ease-out forwards; }
    .text-anim-typewriter { animation: textFadeIn 4s ease-in-out forwards; overflow: hidden; white-space: nowrap; border-right: 2px solid currentColor; animation: textTypewriter 4s steps(20, end) forwards, textFadeIn 4s ease-in-out forwards; }
    .text-anim-scale-pop { animation: textScalePop 4s ease-out forwards; }
    .text-anim-glitch-in { animation: textGlitchIn 4s steps(2, end) forwards; }
    .text-anim-blur-in { animation: textBlurIn 4s ease-out forwards; }
    .text-anim-bounce-in { animation: textBounceIn 4s cubic-bezier(0.34, 1.56, 0.64, 1) forwards; }
    .text-anim-wave { animation: textWave 4s ease-in-out forwards; }
    .text-anim-wave span { display: inline-block; animation: letterWave 1.2s ease-in-out infinite; }
    .text-anim-neon-flicker { animation: textNeonFlicker 4s linear forwards; }
    .text-anim-none { opacity: 1; }
  `;
}

// ---------------------------------------------------------------------------
// resolveTextOverlay — apply overrides to a base overlay
// ---------------------------------------------------------------------------

/**
 * Resolve a text overlay with user overrides applied.
 */
export function resolveTextOverlay(
  base: TextOverlay,
  override: TextOverlayOverride | undefined,
): TextOverlay | null {
  if (override === undefined) return base;
  if (override === null) return null;
  if (typeof override === 'string') {
    return { ...base, text: override };
  }
  return { ...base, ...override };
}
