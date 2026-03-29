/**
 * Effects Engine v4.0 — Multi-pass compositing pipeline.
 *
 * Architecture:
 * Raw Image → Canvas A (motion transform)
 *           → Canvas B (post-processing stack)
 *           → Output Canvas (overlays, particles, text)
 *
 * This engine coordinates motions, transitions, post-processing,
 * and speed ramping for each frame of the rendered video.
 */

import { getMotion, type MotionOpts } from './effects/motions';
import { getTransition, type TransitionOpts } from './effects/transitions';
import { applyPostStack, type PostEffectConfig } from './effects/post-processing';
import { evaluateSpeed, linearToSpeedTime, type SpeedCurve, SPEED_NORMAL, SPEED_PRESETS } from './effects/speed-ramp';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SlotConfig {
  /** Motion effect name */
  motion: string;
  /** Motion easing */
  motionEasing?: string;
  /** Motion intensity (0-1) */
  motionIntensity?: number;
  /** Transition effect name (applied between this slot and the next) */
  transition: string;
  /** Transition easing */
  transitionEasing?: string;
  /** Transition duration in seconds */
  transitionDuration?: number;
  /** Post-processing effects stack */
  postEffects?: PostEffectConfig[];
  /** Speed curve for the slot */
  speedCurve?: SpeedCurve;
  /** Focal point for camera effects (from face detection) */
  focalX?: number;
  focalY?: number;
  /** Slot duration in seconds */
  duration: number;
}

export interface EngineFrame {
  /** Global time in seconds from start of video */
  globalTime: number;
  /** Current slot index */
  slotIndex: number;
  /** Progress within current slot (0-1) */
  slotProgress: number;
  /** Whether we're in a transition zone */
  inTransition: boolean;
  /** Transition progress (0-1), only valid if inTransition */
  transitionProgress: number;
  /** Source slot index for transition */
  transitionSrcSlot: number;
  /** Destination slot index for transition */
  transitionDstSlot: number;
}

// ---------------------------------------------------------------------------
// Engine Class
// ---------------------------------------------------------------------------

export class EffectsEngine {
  private motionCanvas: OffscreenCanvas | HTMLCanvasElement;
  private motionCtx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
  private postCanvas: OffscreenCanvas | HTMLCanvasElement;
  private postCtx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

  constructor(
    private width: number,
    private height: number,
  ) {
    // Create offscreen canvases for multi-pass rendering
    if (typeof OffscreenCanvas !== 'undefined') {
      this.motionCanvas = new OffscreenCanvas(width, height);
      this.postCanvas = new OffscreenCanvas(width, height);
    } else {
      this.motionCanvas = document.createElement('canvas');
      this.motionCanvas.width = width;
      this.motionCanvas.height = height;
      this.postCanvas = document.createElement('canvas');
      this.postCanvas.width = width;
      this.postCanvas.height = height;
    }

    this.motionCtx = this.motionCanvas.getContext('2d') as CanvasRenderingContext2D;
    this.postCtx = this.postCanvas.getContext('2d') as CanvasRenderingContext2D;
  }

  /**
   * Calculate frame metadata for a given global time.
   */
  calculateFrame(
    globalTime: number,
    slots: SlotConfig[],
  ): EngineFrame {
    let accumulated = 0;
    const defaultTransDur = 0.4;

    for (let i = 0; i < slots.length; i++) {
      const slot = slots[i];
      const slotEnd = accumulated + slot.duration;
      const transDur = slot.transitionDuration ?? defaultTransDur;

      // Check if we're in the transition zone at the end of this slot
      const transStart = slotEnd - transDur;
      if (globalTime >= transStart && globalTime < slotEnd && i < slots.length - 1) {
        const transProgress = (globalTime - transStart) / transDur;
        return {
          globalTime,
          slotIndex: i,
          slotProgress: (globalTime - accumulated) / slot.duration,
          inTransition: true,
          transitionProgress: transProgress,
          transitionSrcSlot: i,
          transitionDstSlot: i + 1,
        };
      }

      if (globalTime < slotEnd) {
        return {
          globalTime,
          slotIndex: i,
          slotProgress: (globalTime - accumulated) / slot.duration,
          inTransition: false,
          transitionProgress: 0,
          transitionSrcSlot: i,
          transitionDstSlot: i,
        };
      }

      accumulated = slotEnd;
    }

    // Past the end — return last slot at progress 1
    return {
      globalTime,
      slotIndex: Math.max(0, slots.length - 1),
      slotProgress: 1,
      inTransition: false,
      transitionProgress: 0,
      transitionSrcSlot: Math.max(0, slots.length - 1),
      transitionDstSlot: Math.max(0, slots.length - 1),
    };
  }

  /**
   * Render a single frame.
   *
   * @param outputCtx - The final output canvas context
   * @param frame - Frame metadata from calculateFrame
   * @param slots - Slot configurations
   * @param images - Map of slot index → image source
   */
  renderFrame(
    outputCtx: CanvasRenderingContext2D,
    frame: EngineFrame,
    slots: SlotConfig[],
    images: Map<number, CanvasImageSource>,
  ): void {
    const { width, height } = this;
    const slot = slots[frame.slotIndex];
    if (!slot) return;

    // Apply speed ramping to slot progress
    const speedCurve = slot.speedCurve ?? SPEED_NORMAL;
    const adjustedProgress = linearToSpeedTime(speedCurve, frame.slotProgress);

    if (frame.inTransition) {
      // Render transition between two slots
      const srcSlot = slots[frame.transitionSrcSlot];
      const dstSlot = slots[frame.transitionDstSlot];
      const srcImg = images.get(frame.transitionSrcSlot);
      const dstImg = images.get(frame.transitionDstSlot);

      if (!srcImg || !dstImg) return;

      // Render source slot motion to motionCanvas
      this.motionCtx.clearRect(0, 0, width, height);
      const srcMotion = getMotion(srcSlot.motion);
      const srcOpts: MotionOpts = {
        width,
        height,
        focalX: srcSlot.focalX,
        focalY: srcSlot.focalY,
        intensity: srcSlot.motionIntensity ?? 0.7,
        easing: srcSlot.motionEasing,
      };
      srcMotion(this.motionCtx as CanvasRenderingContext2D, srcImg, adjustedProgress, srcOpts);
      const srcRendered = this.motionCanvas;

      // Render destination slot motion to postCanvas
      this.postCtx.clearRect(0, 0, width, height);
      const dstMotion = getMotion(dstSlot.motion);
      const dstOpts: MotionOpts = {
        width,
        height,
        focalX: dstSlot.focalX,
        focalY: dstSlot.focalY,
        intensity: dstSlot.motionIntensity ?? 0.7,
        easing: dstSlot.motionEasing,
      };
      dstMotion(this.postCtx as CanvasRenderingContext2D, dstImg, 0, dstOpts);
      const dstRendered = this.postCanvas;

      // Apply transition
      const transitionFn = getTransition(slot.transition);
      const transOpts: TransitionOpts = {
        width,
        height,
        easing: slot.transitionEasing,
      };
      outputCtx.clearRect(0, 0, width, height);
      transitionFn(outputCtx, srcRendered, dstRendered, frame.transitionProgress, transOpts);
    } else {
      // Single slot render
      const img = images.get(frame.slotIndex);
      if (!img) return;

      // Pass 1: Motion
      this.motionCtx.clearRect(0, 0, width, height);
      const motionFn = getMotion(slot.motion);
      const motionOpts: MotionOpts = {
        width,
        height,
        focalX: slot.focalX,
        focalY: slot.focalY,
        intensity: slot.motionIntensity ?? 0.7,
        easing: slot.motionEasing,
      };
      motionFn(this.motionCtx as CanvasRenderingContext2D, img, adjustedProgress, motionOpts);

      // Copy to output
      outputCtx.clearRect(0, 0, width, height);
      outputCtx.drawImage(this.motionCanvas, 0, 0);
    }

    // Pass 2: Post-processing (always applied to output)
    if (slot.postEffects && slot.postEffects.length > 0) {
      applyPostStack(outputCtx, width, height, adjustedProgress, slot.postEffects);
    }
  }

  /**
   * Get the total duration of all slots.
   */
  static getTotalDuration(slots: SlotConfig[]): number {
    return slots.reduce((sum, s) => sum + s.duration, 0);
  }

  /**
   * Get the current playback speed for UI display.
   */
  static getCurrentSpeed(slot: SlotConfig, progress: number): number {
    return evaluateSpeed(slot.speedCurve ?? SPEED_NORMAL, progress);
  }

  /**
   * Resize the engine canvases (e.g., when aspect ratio changes).
   */
  resize(width: number, height: number): void {
    this.width = width;
    this.height = height;

    if (this.motionCanvas instanceof OffscreenCanvas) {
      this.motionCanvas.width = width;
      this.motionCanvas.height = height;
      this.postCanvas.width = width;
      (this.postCanvas as OffscreenCanvas).height = height;
    } else {
      (this.motionCanvas as HTMLCanvasElement).width = width;
      (this.motionCanvas as HTMLCanvasElement).height = height;
      (this.postCanvas as HTMLCanvasElement).width = width;
      (this.postCanvas as HTMLCanvasElement).height = height;
    }
  }
}

// ---------------------------------------------------------------------------
// Convenience: convert template slot data to engine slot configs
// ---------------------------------------------------------------------------

import type { TemplateSlot } from '@/types';

/**
 * Convert a v4 TemplateSlot into a SlotConfig for the EffectsEngine.
 * Handles all v4 fields: postEffects, speedPreset, motionIntensity,
 * motionEasing, transitionEasing, transitionDuration.
 *
 * Falls back to sensible defaults for any missing optional fields.
 */
export function templateSlotToEngineSlot(
  templateSlot: TemplateSlot,
  focalX?: number,
  focalY?: number,
): SlotConfig {
  // Resolve speed curve from preset name
  let speedCurve: SpeedCurve = SPEED_NORMAL;
  if (templateSlot.speedPreset && SPEED_PRESETS[templateSlot.speedPreset]) {
    speedCurve = SPEED_PRESETS[templateSlot.speedPreset];
  }

  // Map holdPoint to focal coordinates (face detection overrides these)
  const defaultFx = templateSlot.holdPoint === 'rule-of-thirds' ? 0.33 : 0.5;
  const defaultFy = templateSlot.holdPoint === 'rule-of-thirds' ? 0.33 : 0.5;

  return {
    motion: templateSlot.effect,
    motionEasing: templateSlot.motionEasing,
    motionIntensity: templateSlot.motionIntensity ?? 0.7,
    transition: templateSlot.transition,
    transitionEasing: templateSlot.transitionEasing,
    transitionDuration: templateSlot.transitionDuration ?? 0.4,
    postEffects: templateSlot.postEffects ?? [],
    speedCurve,
    duration: templateSlot.duration,
    focalX: focalX ?? defaultFx,
    focalY: focalY ?? defaultFy,
  };
}
