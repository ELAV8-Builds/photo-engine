/**
 * Split Screen Layout Renderer
 *
 * Renders multiple images into a single canvas using various layout modes:
 * - 2-up-h: Two images side by side (horizontal split)
 * - 2-up-v: Two images stacked (vertical split)
 * - 3-up: One large + two small
 * - 4-grid: Four images in a 2×2 grid
 * - pip: Picture-in-picture (main image with smaller overlay)
 */

import type { SlotLayout } from '@/types';

export interface LayoutRegion {
  /** Normalized x position (0-1) */
  x: number;
  /** Normalized y position (0-1) */
  y: number;
  /** Normalized width (0-1) */
  w: number;
  /** Normalized height (0-1) */
  h: number;
}

/** Gap between panels in pixels */
const GAP = 4;

/**
 * Get the layout regions for a given layout mode.
 * Returns an array of normalized rectangles (0-1 space).
 */
export function getLayoutRegions(layout: SlotLayout): LayoutRegion[] {
  switch (layout) {
    case '2-up-h':
      return [
        { x: 0, y: 0, w: 0.498, h: 1 },
        { x: 0.502, y: 0, w: 0.498, h: 1 },
      ];
    case '2-up-v':
      return [
        { x: 0, y: 0, w: 1, h: 0.498 },
        { x: 0, y: 0.502, w: 1, h: 0.498 },
      ];
    case '3-up':
      // Large image on left, two smaller on right
      return [
        { x: 0, y: 0, w: 0.6, h: 1 },
        { x: 0.604, y: 0, w: 0.396, h: 0.498 },
        { x: 0.604, y: 0.502, w: 0.396, h: 0.498 },
      ];
    case '4-grid':
      return [
        { x: 0, y: 0, w: 0.498, h: 0.498 },
        { x: 0.502, y: 0, w: 0.498, h: 0.498 },
        { x: 0, y: 0.502, w: 0.498, h: 0.498 },
        { x: 0.502, y: 0.502, w: 0.498, h: 0.498 },
      ];
    case 'pip':
      // Main image full frame, PIP in bottom-right corner
      return [
        { x: 0, y: 0, w: 1, h: 1 },
        { x: 0.65, y: 0.6, w: 0.32, h: 0.36 },
      ];
    default:
      // 'single' — full frame
      return [{ x: 0, y: 0, w: 1, h: 1 }];
  }
}

/**
 * Get the number of media items a layout requires.
 */
export function getLayoutMediaCount(layout: SlotLayout): number {
  switch (layout) {
    case '2-up-h':
    case '2-up-v':
    case 'pip':
      return 2;
    case '3-up':
      return 3;
    case '4-grid':
      return 4;
    default:
      return 1;
  }
}

/**
 * Draw a cover-fit image into a specific region of the canvas.
 */
export function drawImageInRegion(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  img: CanvasImageSource,
  canvasWidth: number,
  canvasHeight: number,
  region: LayoutRegion,
  roundCorners: boolean = true,
): void {
  const rx = Math.round(region.x * canvasWidth);
  const ry = Math.round(region.y * canvasHeight);
  const rw = Math.round(region.w * canvasWidth);
  const rh = Math.round(region.h * canvasHeight);

  ctx.save();

  // Clip to region with optional rounded corners
  if (roundCorners && region.w < 1) {
    const radius = Math.min(8, rw * 0.02);
    ctx.beginPath();
    ctx.moveTo(rx + radius, ry);
    ctx.lineTo(rx + rw - radius, ry);
    ctx.quadraticCurveTo(rx + rw, ry, rx + rw, ry + radius);
    ctx.lineTo(rx + rw, ry + rh - radius);
    ctx.quadraticCurveTo(rx + rw, ry + rh, rx + rw - radius, ry + rh);
    ctx.lineTo(rx + radius, ry + rh);
    ctx.quadraticCurveTo(rx, ry + rh, rx, ry + rh - radius);
    ctx.lineTo(rx, ry + radius);
    ctx.quadraticCurveTo(rx, ry, rx + radius, ry);
    ctx.closePath();
    ctx.clip();
  } else {
    ctx.beginPath();
    ctx.rect(rx, ry, rw, rh);
    ctx.clip();
  }

  // Get source dimensions
  let sw = 0, sh = 0;
  if (img instanceof HTMLImageElement) {
    sw = img.naturalWidth || img.width;
    sh = img.naturalHeight || img.height;
  } else if (img instanceof HTMLVideoElement) {
    sw = img.videoWidth || img.width;
    sh = img.videoHeight || img.height;
  } else if (img instanceof HTMLCanvasElement || img instanceof OffscreenCanvas) {
    sw = img.width;
    sh = img.height;
  } else {
    // ImageBitmap or SVGImageElement
    sw = (img as ImageBitmap).width || rw;
    sh = (img as ImageBitmap).height || rh;
  }

  if (sw === 0 || sh === 0) {
    ctx.restore();
    return;
  }

  // Cover-fit into region
  const scale = Math.max(rw / sw, rh / sh);
  const dw = sw * scale;
  const dh = sh * scale;
  ctx.drawImage(img, rx + (rw - dw) / 2, ry + (rh - dh) / 2, dw, dh);

  ctx.restore();
}

/**
 * Draw a PIP border/shadow around the PIP region.
 */
export function drawPipBorder(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  canvasWidth: number,
  canvasHeight: number,
  region: LayoutRegion,
): void {
  const rx = Math.round(region.x * canvasWidth);
  const ry = Math.round(region.y * canvasHeight);
  const rw = Math.round(region.w * canvasWidth);
  const rh = Math.round(region.h * canvasHeight);
  const radius = Math.min(8, rw * 0.03);

  ctx.save();
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.6)';
  ctx.lineWidth = 2;
  ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
  ctx.shadowBlur = 10;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 2;

  ctx.beginPath();
  ctx.moveTo(rx + radius, ry);
  ctx.lineTo(rx + rw - radius, ry);
  ctx.quadraticCurveTo(rx + rw, ry, rx + rw, ry + radius);
  ctx.lineTo(rx + rw, ry + rh - radius);
  ctx.quadraticCurveTo(rx + rw, ry + rh, rx + rw - radius, ry + rh);
  ctx.lineTo(rx + radius, ry + rh);
  ctx.quadraticCurveTo(rx, ry + rh, rx, ry + rh - radius);
  ctx.lineTo(rx, ry + radius);
  ctx.quadraticCurveTo(rx, ry, rx + radius, ry);
  ctx.closePath();
  ctx.stroke();

  ctx.restore();
}

/**
 * Render a complete split-screen layout to a canvas.
 * images array should match the layout's region count.
 */
export function renderSplitScreen(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  layout: SlotLayout,
  images: CanvasImageSource[],
  canvasWidth: number,
  canvasHeight: number,
): void {
  const regions = getLayoutRegions(layout);

  // Clear with black background (gap color)
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, canvasWidth, canvasHeight);

  // Draw each image in its region
  for (let i = 0; i < regions.length && i < images.length; i++) {
    drawImageInRegion(ctx, images[i], canvasWidth, canvasHeight, regions[i]);
  }

  // PIP: add border around the overlay
  if (layout === 'pip' && regions.length > 1) {
    drawPipBorder(ctx, canvasWidth, canvasHeight, regions[1]);
  }
}
