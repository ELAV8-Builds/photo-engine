/**
 * Canvas text overlay renderer for animated text during video export.
 *
 * Provides functions to draw text overlays with various animations
 * (fade-in, slide-up, typewriter, scale-pop, glitch-in) onto an
 * OffscreenCanvas or regular Canvas 2D context.
 */

import type { TextOverlay } from '@/types';
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
// 2. drawTextWithShadow
// ---------------------------------------------------------------------------

/**
 * Draw text with an optional glow / shadow effect.
 *
 * Sets ctx.shadowColor and ctx.shadowBlur when a glowColor is provided,
 * draws the text, then resets shadow state. Caller is responsible for
 * setting font, fillStyle, textAlign, and textBaseline beforehand.
 *
 * @param ctx        - Canvas 2D rendering context
 * @param text       - The string to render
 * @param x          - Horizontal position (px)
 * @param y          - Vertical position (px)
 * @param color      - Fill colour for the text
 * @param glowColor  - Optional shadow/glow colour
 * @param glowSize   - Shadow blur radius (default 15)
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

  // Apply glow if requested
  if (glowColor) {
    ctx.shadowColor = glowColor;
    ctx.shadowBlur = glowSize;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 0;
  }

  ctx.fillStyle = color;
  ctx.fillText(text, x, y);

  // Reset shadow
  ctx.shadowColor = 'transparent';
  ctx.shadowBlur = 0;

  ctx.restore();
}

// ---------------------------------------------------------------------------
// 4. measureTextWidth
// ---------------------------------------------------------------------------

/**
 * Measure the pixel width of a string rendered with the given font settings.
 *
 * Temporarily sets the font on the context, measures, then restores.
 *
 * @param ctx        - Canvas 2D rendering context
 * @param text       - The string to measure
 * @param fontSize   - Size in pixels
 * @param fontWeight - Numeric weight (400, 700, 900 etc.)
 * @returns Width in pixels
 */
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
// 1. drawTextOverlay  (main entry point)
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

  // Use normal compositing
  ctx.globalCompositeOperation = 'source-over';

  // Resolve font properties
  const fontSize = resolveFontSize(overlay.fontSize, canvasHeight);
  const fontWeight = FONT_WEIGHT_MAP[overlay.fontWeight] ?? 400;

  // Set font and alignment
  ctx.font = `${fontWeight} ${fontSize}px ${FONT_FAMILY}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  // Base position
  const baseX = canvasWidth / 2;
  const baseY = canvasHeight * (POSITION_Y_MAP[overlay.position] ?? 0.5);

  // Draw subtle text background plate for readability
  const textWidth = ctx.measureText(overlay.text).width;
  const plateH = fontSize * 1.6;
  const plateW = textWidth + fontSize * 1.5;
  const plateX = baseX - plateW / 2;
  const plateY = baseY - plateH / 2;
  ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
  const plateRadius = fontSize * 0.25;
  ctx.beginPath();
  if (typeof ctx.roundRect === 'function') {
    ctx.roundRect(plateX, plateY, plateW, plateH, plateRadius);
  } else {
    // Fallback for older browsers
    ctx.moveTo(plateX + plateRadius, plateY);
    ctx.lineTo(plateX + plateW - plateRadius, plateY);
    ctx.arcTo(plateX + plateW, plateY, plateX + plateW, plateY + plateRadius, plateRadius);
    ctx.lineTo(plateX + plateW, plateY + plateH - plateRadius);
    ctx.arcTo(plateX + plateW, plateY + plateH, plateX + plateW - plateRadius, plateY + plateH, plateRadius);
    ctx.lineTo(plateX + plateRadius, plateY + plateH);
    ctx.arcTo(plateX, plateY + plateH, plateX, plateY + plateH - plateRadius, plateRadius);
    ctx.lineTo(plateX, plateY + plateRadius);
    ctx.arcTo(plateX, plateY, plateX + plateRadius, plateY, plateRadius);
    ctx.closePath();
  }
  ctx.fill();

  // Dispatch to per-animation renderer
  switch (overlay.animation) {
    case 'fade-in':
      renderFadeIn(ctx, overlay, baseX, baseY, progress);
      break;
    case 'slide-up':
      renderSlideUp(ctx, overlay, baseX, baseY, progress);
      break;
    case 'typewriter':
      renderTypewriter(ctx, overlay, baseX, baseY, progress);
      break;
    case 'scale-pop':
      renderScalePop(ctx, overlay, baseX, baseY, fontSize, progress);
      break;
    case 'glitch-in':
      renderGlitchIn(ctx, overlay, baseX, baseY, canvasWidth, fontSize, progress);
      break;
    case 'none':
    default:
      renderNone(ctx, overlay, baseX, baseY);
      break;
  }

  ctx.restore();
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
    // Fade in: 0 -> 1 over [0, 0.15]
    opacity = subProgress(progress, 0, 0.15);
  } else if (progress > 0.85) {
    // Fade out: 1 -> 0 over [0.85, 1]
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
    // Slide in from +30px below, fade in
    const t = easeOut(subProgress(progress, 0, 0.2));
    opacity = t;
    offsetY = 30 * (1 - t); // starts at +30, ends at 0
  } else if (progress > 0.8) {
    // Slide up -20px above, fade out
    const t = subProgress(progress, 0.8, 1);
    opacity = 1 - t;
    offsetY = -20 * t;
  } else {
    // Hold
    opacity = 1;
    offsetY = 0;
  }

  ctx.globalAlpha = clamp01(opacity);
  drawTextWithShadow(ctx, overlay.text, x, baseY + offsetY, overlay.color, overlay.glowColor);
}

/** typewriter: characters revealed left-to-right, then fade out */
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

  if (progress < 0.6) {
    // Reveal characters one-by-one over [0, 0.6]
    const t = subProgress(progress, 0, 0.6);
    const visibleChars = Math.ceil(t * fullText.length);
    displayText = fullText.slice(0, visibleChars);
  } else if (progress > 0.85) {
    // Fade out over [0.85, 1]
    displayText = fullText;
    opacity = 1 - subProgress(progress, 0.85, 1);
  } else {
    // Hold full text
    displayText = fullText;
  }

  ctx.globalAlpha = clamp01(opacity);
  drawTextWithShadow(ctx, displayText, x, y, overlay.color, overlay.glowColor);
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
    // Pop in: scale 0.3 -> 1.2, fade in
    const t = easeOut(subProgress(progress, 0, 0.1));
    scale = 0.3 + t * (1.2 - 0.3); // 0.3 to 1.2
    opacity = t;
  } else if (progress < 0.2) {
    // Settle: scale 1.2 -> 1.0
    const t = subProgress(progress, 0.1, 0.2);
    scale = 1.2 - t * 0.2;
    opacity = 1;
  } else if (progress > 0.8) {
    // Scale to 0.8, fade out
    const t = subProgress(progress, 0.8, 1);
    scale = 1.0 - t * 0.2;
    opacity = 1 - t;
  } else {
    // Hold at 1.0
    scale = 1;
    opacity = 1;
  }

  ctx.globalAlpha = clamp01(opacity);

  // Apply scale transform centered on the text position
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
  canvasWidth: number,
  fontSize: number,
  progress: number,
): void {
  // Maximum horizontal offset during glitch (proportional to font size)
  const maxOffset = fontSize * 0.5;
  // Number of glitch copies to draw per frame
  const glitchCopies = 3;

  if (progress < 0.05) {
    // Invisible
    return;
  }

  if (progress < 0.15) {
    // Flicker in: random offsets and opacity
    const seed = Math.round(progress * 1000); // changes each frame step
    for (let i = 0; i < glitchCopies; i++) {
      const r = pseudoRandom(seed + i * 7);
      const offsetX = (r - 0.5) * 2 * maxOffset;
      const glitchOpacity = 0.3 + pseudoRandom(seed + i * 13) * 0.7;

      ctx.globalAlpha = glitchOpacity;

      // Randomly tint some copies with shifted colours
      const useAltColor = pseudoRandom(seed + i * 19) > 0.5;
      const color = useAltColor ? shiftColor(overlay.color, seed + i) : overlay.color;

      drawTextWithShadow(ctx, overlay.text, x + offsetX, y, color, overlay.glowColor);
    }
    return;
  }

  if (progress < 0.2) {
    // Settle to final position
    const t = subProgress(progress, 0.15, 0.2);
    const residualOffset = maxOffset * 0.3 * (1 - easeOut(t));
    const seed = Math.round(progress * 1000);
    const offsetX = (pseudoRandom(seed) - 0.5) * 2 * residualOffset;

    ctx.globalAlpha = 0.8 + 0.2 * t;
    drawTextWithShadow(ctx, overlay.text, x + offsetX, y, overlay.color, overlay.glowColor);
    return;
  }

  if (progress <= 0.8) {
    // Hold steady
    ctx.globalAlpha = 1;
    drawTextWithShadow(ctx, overlay.text, x, y, overlay.color, overlay.glowColor);
    return;
  }

  if (progress < 0.9) {
    // Flicker out
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

  // progress >= 0.9 — invisible
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

/**
 * Shift a CSS colour slightly for the glitch effect.
 * Produces a reddish or cyanish tint based on the seed.
 */
function shiftColor(color: string, seed: number): string {
  const r = pseudoRandom(seed);
  if (r < 0.33) return '#ff0044'; // red
  if (r < 0.66) return '#00ffff'; // cyan
  return '#ff00ff'; // magenta
}

// ---------------------------------------------------------------------------
// 3. getTextPreviewCSS
// ---------------------------------------------------------------------------

/** Maps fontSize tokens to approximate CSS pixel values for DOM preview */
const PREVIEW_FONT_SIZES: Record<TextOverlay['fontSize'], number> = {
  sm: 14,
  md: 22,
  lg: 36,
  xl: 52,
};

/**
 * Returns CSS styles that approximate the text overlay appearance for
 * DOM-based preview (e.g., template cards). Not pixel-perfect with the
 * canvas renderer, but visually representative.
 *
 * @param overlay - TextOverlay descriptor
 * @returns Object containing a `style` property with React CSSProperties
 */
export function getTextPreviewCSS(overlay: TextOverlay): { style: CSSProperties } {
  const fontSize = PREVIEW_FONT_SIZES[overlay.fontSize] ?? PREVIEW_FONT_SIZES.md;
  const fontWeight = FONT_WEIGHT_MAP[overlay.fontWeight] ?? 400;

  // Position mapping
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

  // Text shadow for glow
  const textShadow = overlay.glowColor
    ? `0 0 15px ${overlay.glowColor}, 0 0 30px ${overlay.glowColor}`
    : undefined;

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
    ...(top !== undefined && { top }),
    ...(bottom !== undefined && { bottom }),
    ...(textShadow !== undefined && { textShadow }),
  };

  return { style };
}
