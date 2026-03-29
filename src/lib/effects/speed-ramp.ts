/**
 * Speed Ramp System — Variable playback speed curves.
 *
 * Used to create dramatic slow-mo / fast-forward effects
 * that are key to the Insta360 / CapCut aesthetic.
 *
 * A speed curve is an array of keyframes, each with a time (0-1) and speed multiplier.
 * The system interpolates between keyframes with configurable easing.
 */

import { getEasing, clamp, lerp, type EasingFn } from './easing';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SpeedKeyframe {
  /** Position in the clip (0-1) */
  time: number;
  /** Speed multiplier (0.25 = quarter speed, 1 = normal, 4 = 4x speed) */
  speed: number;
  /** Easing to use when transitioning TO this keyframe */
  easing?: string;
}

export interface SpeedCurve {
  keyframes: SpeedKeyframe[];
}

// ---------------------------------------------------------------------------
// Preset speed curves
// ---------------------------------------------------------------------------

/** Normal speed throughout */
export const SPEED_NORMAL: SpeedCurve = {
  keyframes: [
    { time: 0, speed: 1 },
    { time: 1, speed: 1 },
  ],
};

/** Classic Insta360 speed ramp: slow → FAST → slow */
export const SPEED_RAMP_CLASSIC: SpeedCurve = {
  keyframes: [
    { time: 0, speed: 0.5, easing: 'ease-in' },
    { time: 0.15, speed: 0.3, easing: 'ease-in-out' },
    { time: 0.35, speed: 3, easing: 'snap' },
    { time: 0.65, speed: 3, easing: 'ease-in-out' },
    { time: 0.85, speed: 0.3, easing: 'ease-out' },
    { time: 1, speed: 0.5 },
  ],
};

/** Dramatic entrance: very slow then sudden speed up */
export const SPEED_RAMP_DRAMATIC: SpeedCurve = {
  keyframes: [
    { time: 0, speed: 0.2, easing: 'linear' },
    { time: 0.4, speed: 0.2, easing: 'snap' },
    { time: 0.5, speed: 4, easing: 'ease-out' },
    { time: 1, speed: 1 },
  ],
};

/** Pulse: alternating slow/fast for rhythmic feel */
export const SPEED_RAMP_PULSE: SpeedCurve = {
  keyframes: [
    { time: 0, speed: 0.5, easing: 'ease-in-out' },
    { time: 0.25, speed: 2, easing: 'ease-in-out' },
    { time: 0.5, speed: 0.5, easing: 'ease-in-out' },
    { time: 0.75, speed: 2, easing: 'ease-in-out' },
    { time: 1, speed: 0.5 },
  ],
};

/** Slow motion throughout */
export const SPEED_SLOW_MO: SpeedCurve = {
  keyframes: [
    { time: 0, speed: 0.3 },
    { time: 1, speed: 0.3 },
  ],
};

/** Speed up: starts slow, ends fast */
export const SPEED_ACCELERATE: SpeedCurve = {
  keyframes: [
    { time: 0, speed: 0.3, easing: 'ease-in' },
    { time: 1, speed: 3 },
  ],
};

/** Slow down: starts fast, ends slow */
export const SPEED_DECELERATE: SpeedCurve = {
  keyframes: [
    { time: 0, speed: 3, easing: 'ease-out' },
    { time: 1, speed: 0.3 },
  ],
};

/** Named preset map (includes ramp- prefixed aliases used by templates) */
export const SPEED_PRESETS: Record<string, SpeedCurve> = {
  'normal': SPEED_NORMAL,
  'classic': SPEED_RAMP_CLASSIC,
  'ramp-classic': SPEED_RAMP_CLASSIC,
  'dramatic': SPEED_RAMP_DRAMATIC,
  'ramp-dramatic': SPEED_RAMP_DRAMATIC,
  'pulse': SPEED_RAMP_PULSE,
  'ramp-pulse': SPEED_RAMP_PULSE,
  'slow-mo': SPEED_SLOW_MO,
  'accelerate': SPEED_ACCELERATE,
  'decelerate': SPEED_DECELERATE,
};

// ---------------------------------------------------------------------------
// Speed evaluation
// ---------------------------------------------------------------------------

/**
 * Get the playback speed at a given time position (0-1).
 * Interpolates between keyframes using specified easing.
 */
export function evaluateSpeed(curve: SpeedCurve, t: number): number {
  const { keyframes } = curve;
  if (keyframes.length === 0) return 1;
  if (keyframes.length === 1) return keyframes[0].speed;

  const clamped = clamp(t, 0, 1);

  // Find surrounding keyframes
  let i = 0;
  while (i < keyframes.length - 1 && keyframes[i + 1].time <= clamped) {
    i++;
  }

  if (i >= keyframes.length - 1) return keyframes[keyframes.length - 1].speed;

  const kf0 = keyframes[i];
  const kf1 = keyframes[i + 1];
  const segmentT = (clamped - kf0.time) / (kf1.time - kf0.time);
  const easingFn: EasingFn = getEasing(kf1.easing);
  const easedT = easingFn(segmentT);

  return lerp(kf0.speed, kf1.speed, easedT);
}

/**
 * Convert linear time to speed-adjusted time.
 *
 * For rendering: given a linear frame position (0-1), returns
 * the actual playback position (0-1) after speed adjustments.
 *
 * Uses numerical integration (trapezoidal rule) over the speed curve.
 */
export function linearToSpeedTime(curve: SpeedCurve, linearT: number, steps = 100): number {
  const dt = linearT / steps;
  let integral = 0;

  for (let i = 0; i < steps; i++) {
    const t0 = i * dt;
    const t1 = (i + 1) * dt;
    const s0 = evaluateSpeed(curve, t0);
    const s1 = evaluateSpeed(curve, t1);
    integral += (s0 + s1) / 2 * dt;
  }

  // Normalize: the total integral over 0-1 gives us the speed-adjusted total
  const totalIntegral = (() => {
    const fullDt = 1 / steps;
    let total = 0;
    for (let i = 0; i < steps; i++) {
      const t0 = i * fullDt;
      const t1 = (i + 1) * fullDt;
      const s0 = evaluateSpeed(curve, t0);
      const s1 = evaluateSpeed(curve, t1);
      total += (s0 + s1) / 2 * fullDt;
    }
    return total;
  })();

  return totalIntegral > 0 ? clamp(integral / totalIntegral, 0, 1) : linearT;
}
