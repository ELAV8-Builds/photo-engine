/**
 * Deterministic technical verdict per second of video.
 *
 * Pure functions over the raw Stage-1 measurements. No I/O, no ML — this is
 * the gate that keeps black, blown-out, blurry and violently shaky seconds
 * away from the (slower) vision model in Phase 2, and it is the part a small
 * VLM demonstrably gets wrong on its own.
 *
 * Thresholds are on ffmpeg's 0–255 luma scale and the 0–1 scene-change score.
 * They were calibrated on real X5 footage (see docs in Phase 1 handoff).
 */

import type { TechnicalVerdict } from '@/types/library';

export interface RawSamples {
  /** Sample timestamps in seconds. */
  t: number[];
  brightness: number[];
  motion: number[];
  sharpness: number[];
  /** Per whole second, dBFS; null where there is no audio. */
  audioRmsDb: Array<number | null>;
  durationSec: number;
}

export const THRESHOLDS = {
  /** Mean luma below this is effectively black (lens covered, pocket). */
  darkFloor: 18,
  /** Ideal exposure band. */
  brightIdealLow: 40,
  brightIdealHigh: 200,
  /** Above this the frame is washed out (measured 229–232 on a blown-out doorway shot). */
  brightCeiling: 230,
  /** Sharpness relative to the clip's own 75th percentile edge energy. */
  sharpRelativeFloor: 0.35,
  /** Absolute edge-energy floor so an entirely soft clip does not pass by default. */
  sharpAbsoluteFloor: 3,
  /** Scene score above this between consecutive samples = whip/shake/cut. */
  shakeCeiling: 0.45,
  /** Scene score above this = novelty peak (new content). */
  noveltyFloor: 0.3,
  /** Motion sweet spot for lively-but-watchable footage. */
  motionIdealLow: 0.01,
  motionIdealHigh: 0.25,
  /** Audio spike: this many dB over the clip mean AND > 1.5σ. */
  audioEventDb: 6,
  audioEventSigma: 1.5,
} as const;

function clamp01(x: number): number {
  return x < 0 ? 0 : x > 1 ? 1 : x;
}

/** Linear ramp: 0 at `a`, 1 at `b` (works for descending ramps too). */
function ramp(x: number, a: number, b: number): number {
  if (a === b) return x >= b ? 1 : 0;
  return clamp01((x - a) / (b - a));
}

export function percentile(values: number[], p: number): number {
  const finite = values.filter((v) => Number.isFinite(v)).sort((a, b) => a - b);
  if (finite.length === 0) return 0;
  const idx = Math.min(finite.length - 1, Math.max(0, Math.round((p / 100) * (finite.length - 1))));
  return finite[idx];
}

function meanStd(values: Array<number | null>): { mean: number; std: number; n: number } {
  const finite = values.filter((v): v is number => typeof v === 'number' && Number.isFinite(v));
  const n = finite.length;
  if (n === 0) return { mean: NaN, std: NaN, n: 0 };
  const mean = finite.reduce((s, v) => s + v, 0) / n;
  const variance = finite.reduce((s, v) => s + (v - mean) ** 2, 0) / n;
  return { mean, std: Math.sqrt(variance), n };
}

export function brightnessScore(luma: number): number {
  const T = THRESHOLDS;
  if (luma <= T.darkFloor) return 0;
  if (luma < T.brightIdealLow) return ramp(luma, T.darkFloor, T.brightIdealLow);
  if (luma <= T.brightIdealHigh) return 1;
  if (luma < T.brightCeiling) return 0.2 + 0.8 * ramp(luma, T.brightCeiling, T.brightIdealHigh);
  return 0;
}

export function motionScore(scene: number): number {
  const T = THRESHOLDS;
  if (scene >= T.shakeCeiling) return 0;
  if (scene > T.motionIdealHigh) return ramp(scene, T.shakeCeiling, T.motionIdealHigh);
  if (scene >= T.motionIdealLow) return 1;
  // Static frames are fine, just less lively.
  return 0.3 + 0.7 * ramp(scene, 0, T.motionIdealLow);
}

/** Bucket samples into whole seconds, averaging within each second. */
export function bucketBySecond(t: number[], values: number[], seconds: number, reducer: 'mean' | 'max'): number[] {
  const sums = new Array<number>(seconds).fill(0);
  const counts = new Array<number>(seconds).fill(0);
  const maxes = new Array<number>(seconds).fill(-Infinity);
  for (let i = 0; i < t.length; i++) {
    const s = Math.min(seconds - 1, Math.max(0, Math.floor(t[i])));
    const v = values[i];
    if (!Number.isFinite(v)) continue;
    sums[s] += v;
    counts[s] += 1;
    if (v > maxes[s]) maxes[s] = v;
  }
  return sums.map((sum, s) => {
    if (counts[s] === 0) return NaN;
    return reducer === 'max' ? maxes[s] : sum / counts[s];
  });
}

export function computeTechnicalVerdict(raw: RawSamples): TechnicalVerdict {
  const seconds = Math.max(1, Math.ceil(raw.durationSec));
  const luma = bucketBySecond(raw.t, raw.brightness, seconds, 'mean');
  const motionMean = bucketBySecond(raw.t, raw.motion, seconds, 'mean');
  const motionPeak = bucketBySecond(raw.t, raw.motion, seconds, 'max');
  const edge = bucketBySecond(raw.t, raw.sharpness, seconds, 'mean');

  const edgeP75 = percentile(raw.sharpness, 75);
  const sharpFloor = Math.max(THRESHOLDS.sharpAbsoluteFloor, edgeP75 * THRESHOLDS.sharpRelativeFloor);

  const audio = meanStd(raw.audioRmsDb);

  const usable: boolean[] = [];
  const technical: number[] = [];
  const audioEvent: boolean[] = [];
  const novelty: boolean[] = [];

  for (let s = 0; s < seconds; s++) {
    const l = luma[s];
    const e = edge[s];
    const mMean = motionMean[s];
    const mPeak = motionPeak[s];

    // Seconds without samples (tail rounding) inherit a neutral verdict.
    if (!Number.isFinite(l)) {
      usable.push(false);
      technical.push(0);
      audioEvent.push(false);
      novelty.push(false);
      continue;
    }

    const bright = brightnessScore(l);
    const sharp = Number.isFinite(e) ? clamp01(e / Math.max(edgeP75, 1e-6)) : 0;
    const motion = Number.isFinite(mMean) ? motionScore(mMean) : 0.3;
    const shaken = Number.isFinite(mPeak) && mPeak >= THRESHOLDS.shakeCeiling;

    const isUsable =
      l > THRESHOLDS.darkFloor &&
      l < THRESHOLDS.brightCeiling &&
      (Number.isFinite(e) ? e >= sharpFloor : true) &&
      !shaken;

    usable.push(isUsable);
    technical.push(Math.round((0.45 * bright + 0.35 * sharp + 0.2 * motion) * 1000) / 1000);
    novelty.push(Number.isFinite(mPeak) && mPeak >= THRESHOLDS.noveltyFloor);

    const db = raw.audioRmsDb[s] ?? NaN;
    const spike =
      audio.n >= 4 &&
      Number.isFinite(db) &&
      Number.isFinite(audio.std) &&
      db - audio.mean >= THRESHOLDS.audioEventDb &&
      audio.std > 0 &&
      (db - audio.mean) / audio.std >= THRESHOLDS.audioEventSigma;
    audioEvent.push(spike);
  }

  return { usable, technical, audioEvent, novelty };
}
