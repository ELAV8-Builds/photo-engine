/**
 * Easing functions library for PhotoForge effects engine.
 *
 * All functions take t (0-1) and return a value (0-1).
 * Used for motion effects, transitions, text animations.
 */

export type EasingFn = (t: number) => number;

// ---------------------------------------------------------------------------
// Standard easing curves
// ---------------------------------------------------------------------------

export const linear: EasingFn = (t) => t;

export const easeIn: EasingFn = (t) => t * t * t;

export const easeOut: EasingFn = (t) => 1 - Math.pow(1 - t, 3);

export const easeInOut: EasingFn = (t) =>
  t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

// ---------------------------------------------------------------------------
// Physical easing curves
// ---------------------------------------------------------------------------

/** Spring: overshoot then settle */
export const spring: EasingFn = (t) => {
  const c4 = (2 * Math.PI) / 3;
  if (t === 0) return 0;
  if (t === 1) return 1;
  return Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * c4) + 1;
};

/** Bounce back at the end */
export const bounceBack: EasingFn = (t) => {
  const n1 = 7.5625;
  const d1 = 2.75;

  if (t < 1 / d1) {
    return n1 * t * t;
  } else if (t < 2 / d1) {
    return n1 * (t -= 1.5 / d1) * t + 0.75;
  } else if (t < 2.5 / d1) {
    return n1 * (t -= 2.25 / d1) * t + 0.9375;
  } else {
    return n1 * (t -= 2.625 / d1) * t + 0.984375;
  }
};

/** Snap: fast ease-out with sharp deceleration */
export const snap: EasingFn = (t) => {
  const sq = t * t;
  return sq / (2 * (sq - t) + 1);
};

// ---------------------------------------------------------------------------
// Additional curves for effects
// ---------------------------------------------------------------------------

/** Smooth step (Hermite interpolation) */
export const smoothStep: EasingFn = (t) => t * t * (3 - 2 * t);

/** Smoother step (Ken Perlin's improvement) */
export const smootherStep: EasingFn = (t) => t * t * t * (t * (t * 6 - 15) + 10);

/** Elastic in: spring from start */
export const elasticIn: EasingFn = (t) => {
  const c4 = (2 * Math.PI) / 3;
  if (t === 0) return 0;
  if (t === 1) return 1;
  return -Math.pow(2, 10 * t - 10) * Math.sin((t * 10 - 10.75) * c4);
};

/** Exponential in-out */
export const expInOut: EasingFn = (t) => {
  if (t === 0) return 0;
  if (t === 1) return 1;
  if (t < 0.5) return Math.pow(2, 20 * t - 10) / 2;
  return (2 - Math.pow(2, -20 * t + 10)) / 2;
};

/** Back: overshoot slightly then return */
export const backOut: EasingFn = (t) => {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
};

// ---------------------------------------------------------------------------
// Easing registry (by name)
// ---------------------------------------------------------------------------

export type EasingName =
  | 'linear' | 'ease-in' | 'ease-out' | 'ease-in-out'
  | 'spring' | 'bounce-back' | 'snap'
  | 'smooth-step' | 'elastic-in' | 'exp-in-out' | 'back-out';

const EASING_MAP: Record<EasingName, EasingFn> = {
  'linear': linear,
  'ease-in': easeIn,
  'ease-out': easeOut,
  'ease-in-out': easeInOut,
  'spring': spring,
  'bounce-back': bounceBack,
  'snap': snap,
  'smooth-step': smoothStep,
  'elastic-in': elasticIn,
  'exp-in-out': expInOut,
  'back-out': backOut,
};

/**
 * Get an easing function by name. Falls back to ease-in-out.
 */
export function getEasing(name: string | undefined): EasingFn {
  return EASING_MAP[name as EasingName] ?? easeInOut;
}

// ---------------------------------------------------------------------------
// Interpolation helpers
// ---------------------------------------------------------------------------

/** Linear interpolation between a and b */
export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Clamp a value between min and max */
export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/** Map a value from one range to another */
export function remap(value: number, inMin: number, inMax: number, outMin: number, outMax: number): number {
  const t = clamp((value - inMin) / (inMax - inMin), 0, 1);
  return lerp(outMin, outMax, t);
}

/** Ping-pong: 0→1→0 over t (0→1) */
export function pingPong(t: number): number {
  return t < 0.5 ? t * 2 : 2 - t * 2;
}
