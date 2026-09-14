/**
 * Stage 2 — local vision-model curation.
 *
 * Videos: sample frames only where Stage 1 says the second is usable, skip
 * near-duplicates by perceptual hash, grade with the model, fuse the grade
 * with Stage-1 motion/audio/novelty, pick temporally spread peaks, snap each
 * onto its sharpest 3–5 s and (for 360) let the model choose the yaw.
 * Photos: grade the thumbnail.
 *
 * The pure planning/fusion/selection functions are exported so they can be
 * exercised without ffmpeg or a model; `curateVideo` / `curatePhoto` do the
 * orchestration and I/O.
 */

import fsp from 'fs/promises';
import path from 'path';
import { assertServer } from '../runtime';
import { createLogger } from '../log';
import type { FfmpegOptions } from '../media/ffmpeg';
import type { IndexedItem } from '../library/index-store';
import type { VisionProvider } from '../ai/provider';
import { bucketBySecond, motionScore, THRESHOLDS } from './technical-score';
import { hammingDistance, hashesFromRaw, type FrameHash } from './phash';
import {
  defaultViewCandidates,
  extractSampleFrames,
  measureWindow,
  pitchedViewCandidates,
  renderViewCandidates,
  SAMPLE_STEP_SEC,
  type RefineSamples,
} from './frames';
import { clearPartial, loadPartial, savePartial, type PartialCuration } from '../curation/record';
import type { CurationRecord, FrameGrade, HighlightView, HighlightWindow, SignalTrack } from '@/types/library';

assertServer();

const log = createLogger('curate');

export const CURATION = {
  /** Base spacing between graded frames, seconds (must be a multiple of SAMPLE_STEP_SEC). */
  baseIntervalSec: 4,
  eventIntervalSec: 2,
  staticIntervalSec: 6,
  /** Upper bound on graded samples per clip; longer clips get sparser sampling. */
  maxSamples: 240,
  /** Frames this close (Hamming, 64-bit aHash) to the previous graded frame reuse its grade. */
  dedupHamming: 6,
  /** Save partial grades this often so a restart resumes. */
  partialEvery: 20,
  windowSec: 4,
  minWindowSec: 3,
  maxWindowSec: 5,
  refineRadiusSec: 3,
  /** Quality flags other than ok/blocked only drop a second when Stage 1 also finds it weak. */
  softQualityTechnicalFloor: 0.5,
  softQualityPenalty: 0.7,
} as const;

// ---------------------------------------------------------------------------
// Pure: sampling plan
// ---------------------------------------------------------------------------

function nearEvent(track: SignalTrack, s: number, radius = 2): boolean {
  const { audioEvent, novelty } = track.perSecond;
  for (let d = -radius; d <= radius; d++) {
    const i = s + d;
    if (i < 0 || i >= audioEvent.length) continue;
    if (audioEvent[i] || novelty[i]) return true;
  }
  return false;
}

/**
 * Which seconds to grade. Even seconds only (frames exist at 0.5 fps), never
 * an unusable second; denser around audio/novelty events, sparser through
 * static stretches, and thinned uniformly when a long clip would exceed
 * `maxSamples`.
 */
export function planSampleTimes(track: SignalTrack): number[] {
  const seconds = track.perSecond.usable.length;
  const motionMean = bucketBySecond(track.t, track.motion, seconds, 'mean');

  const isStatic = (s: number): boolean => {
    let sum = 0;
    let n = 0;
    for (let i = Math.max(0, s - 10); i < Math.min(seconds, s + 10); i++) {
      if (Number.isFinite(motionMean[i])) {
        sum += motionMean[i];
        n += 1;
      }
    }
    return n > 0 && sum / n < THRESHOLDS.motionIdealLow;
  };

  const plan = (scale: number): number[] => {
    const out: number[] = [];
    let nextAllowed = 0;
    for (let s = 0; s < seconds; s += SAMPLE_STEP_SEC) {
      if (!track.perSecond.usable[s]) continue;
      if (s < nextAllowed) continue;
      out.push(s);
      const interval = nearEvent(track, s) ? CURATION.eventIntervalSec : isStatic(s) ? CURATION.staticIntervalSec : CURATION.baseIntervalSec;
      nextAllowed = s + Math.max(SAMPLE_STEP_SEC, Math.round((interval * scale) / SAMPLE_STEP_SEC) * SAMPLE_STEP_SEC);
    }
    return out;
  };

  let times = plan(1);
  for (let scale = 1.5; times.length > CURATION.maxSamples && scale < 64; scale *= 1.5) times = plan(scale);
  return times;
}

// ---------------------------------------------------------------------------
// Pure: fusion + selection
// ---------------------------------------------------------------------------

export interface Candidate {
  t: number;
  score: number;
  grade: FrameGrade;
}

/** Per-second motion score (0–1) derived from the Stage-1 samples. */
export function perSecondMotionScore(track: SignalTrack): number[] {
  const seconds = track.perSecond.usable.length;
  return bucketBySecond(track.t, track.motion, seconds, 'mean').map((m) => (Number.isFinite(m) ? motionScore(m) : 0.3));
}

/**
 * Fuse a frame grade with Stage-1 context. `blocked` always drops; dark/blur/
 * bright only drop when Stage 1 agrees the second is technically weak — the
 * model over-flags sunlit and dim-but-fine frames (measured).
 */
export function fuseCandidate(t: number, grade: FrameGrade, track: SignalTrack, motion: number[]): Candidate | null {
  const s = Math.min(track.perSecond.usable.length - 1, Math.max(0, Math.floor(t)));
  if (grade.quality === 'blocked') return null;
  let score =
    0.5 * (grade.interest / 10) +
    0.15 * (grade.faces ? 1 : grade.people ? 0.6 : 0) +
    0.15 * (motion[s] ?? 0.3) +
    0.1 * (track.perSecond.audioEvent[s] ? 1 : 0) +
    0.1 * (track.perSecond.novelty[s] ? 1 : 0);
  if (grade.quality !== 'ok') {
    if ((track.perSecond.technical[s] ?? 0) < CURATION.softQualityTechnicalFloor) return null;
    score *= CURATION.softQualityPenalty;
  }
  return { t, score: Math.round(score * 1000) / 1000, grade };
}

export function highlightCap(durationSec: number): number {
  return Math.max(1, Math.min(8, Math.round(durationSec / 150)));
}

export function minGapSec(durationSec: number): number {
  return Math.max(20, 0.05 * durationSec);
}

/** Phase 7 (§3.2): a short clip's runner-up must score within 15% of the top to earn a second moment. */
export const SECOND_MOMENT_SCORE_RATIO = 0.85;

/**
 * Greedy temporal non-max suppression: best first, nothing within `minGap` of a
 * pick. Clips capped at one moment (under 225 s) may keep a second when another
 * candidate at least the gap away scores within 15% of the top — a short clip
 * with two genuinely strong beats deserves both (§3.2).
 */
export function selectPeaks(candidates: Candidate[], durationSec: number): Candidate[] {
  const cap = highlightCap(durationSec);
  const gap = minGapSec(durationSec);
  const sorted = [...candidates].sort((a, b) => b.score - a.score || a.t - b.t);
  const picked: Candidate[] = [];
  for (const c of sorted) {
    if (picked.length >= cap) break;
    if (picked.every((p) => Math.abs(p.t - c.t) >= gap)) picked.push(c);
  }
  if (cap === 1 && picked.length === 1) {
    const top = picked[0];
    const second = sorted.find((c) => c !== top && Math.abs(c.t - top.t) >= gap && c.score >= SECOND_MOMENT_SCORE_RATIO * top.score);
    if (second) picked.push(second);
  }
  return picked;
}

/**
 * Snap a window of `windowSec` onto the stretch around `sampleT` with the
 * highest mean sharpness × motion score. Falls back to centring on sampleT.
 */
export function refineWindow(samples: RefineSamples, sampleT: number, durationSec: number, windowSec = CURATION.windowSec): { start: number; end: number } {
  const len = Math.min(durationSec, Math.min(CURATION.maxWindowSec, Math.max(CURATION.minWindowSec, windowSec)));
  const clampStart = (s: number) => Math.max(0, Math.min(Math.max(0, durationSec - len), s));

  const n = samples.t.length;
  if (n === 0) return finish(clampStart(sampleT - len / 2), len, durationSec);

  const maxSharp = Math.max(1e-6, ...samples.sharpness);
  const value = samples.sharpness.map((sh, i) => (sh / maxSharp) * motionScore(samples.motion[i]));

  let bestStart = clampStart(sampleT - len / 2);
  let best = -Infinity;
  for (let i = 0; i < n; i++) {
    const start = samples.t[i];
    let sum = 0;
    let count = 0;
    for (let j = i; j < n && samples.t[j] < start + len; j++) {
      sum += value[j];
      count += 1;
    }
    if (count === 0) continue;
    // Windows that run past the measured range are penalised by their missing samples.
    const expected = Math.max(count, Math.round(len * 2));
    const mean = sum / expected;
    if (mean > best) {
      best = mean;
      bestStart = clampStart(start);
    }
  }
  return finish(bestStart, len, durationSec);
}

function finish(start: number, len: number, durationSec: number): { start: number; end: number } {
  const s = Math.round(start * 10) / 10;
  const e = Math.round(Math.min(durationSec, s + len) * 10) / 10;
  return { start: s, end: e };
}

/** Score used to pick a 360 view: interest plus a bump for faces. */
export function viewScore(grade: FrameGrade): number {
  return grade.interest / 10 + (grade.faces ? 0.1 : 0);
}

export function photoScore(grade: FrameGrade): number {
  let score = 0.8 * (grade.interest / 10) + 0.2 * (grade.faces ? 1 : grade.people ? 0.6 : 0);
  if (grade.quality === 'blocked') score *= 0.3;
  else if (grade.quality !== 'ok') score *= 0.6;
  return Math.round(score * 1000) / 1000;
}

// ---------------------------------------------------------------------------
// Orchestration
// ---------------------------------------------------------------------------

export interface CurateOptions extends FfmpegOptions {
  provider: VisionProvider;
  /** Job-scoped scratch directory; the caller removes it. */
  tmpDir: string;
  signal: AbortSignal;
  onProgress?: (fraction: number) => void;
}

function checkAborted(signal: AbortSignal): void {
  if (signal.aborted) throw new Error('Curation cancelled');
}

/** Grade the (≤512 px, upright) thumbnail of a photo. */
export async function curatePhoto(item: IndexedItem, thumbPath: string, opts: CurateOptions): Promise<CurationRecord> {
  const started = Date.now();
  const jpeg = await fsp.readFile(thumbPath);
  const grade = await opts.provider.gradeFrame(jpeg, { signal: opts.signal, label: item.name });
  return {
    version: 1,
    itemId: item.id,
    kind: 'photo',
    provider: opts.provider.name,
    model: opts.provider.model,
    createdAt: Date.now(),
    durationMs: Date.now() - started,
    score: photoScore(grade),
    grade,
    highlights: [],
    stats: { sampled: 1, graded: 1, reused: 0, candidates: 1 },
  };
}

export async function curateVideo(item: IndexedItem, track: SignalTrack, opts: CurateOptions): Promise<CurationRecord> {
  const { provider, tmpDir, signal, onProgress, ...ffmpegOpts } = opts;
  const started = Date.now();
  const durationSec = track.durationSec;

  const useCameraProxy = item.layout === 'dual-fisheye-streams' && !!item.cameraProxyAbsPath;
  const input = useCameraProxy ? item.cameraProxyAbsPath! : item.absPath;
  const layout = useCameraProxy ? 'dual-fisheye-sbs' : item.layout;
  const is360 = layout === 'dual-fisheye-sbs' || layout === 'dual-fisheye-streams';

  // 1. Sample frames + hashes in one ffmpeg pass.
  const times = planSampleTimes(track);
  const extraction = await extractSampleFrames(input, { ...ffmpegOpts, signal, layout, durationSec, outDir: path.join(tmpDir, 'samples') });
  const hashes: FrameHash[] = hashesFromRaw(extraction.hashRaw);
  checkAborted(signal);

  // 2–3. Dedup + grade, resuming from any partial file.
  const partial: PartialCuration = (await loadPartial(item.id, provider.model)) ?? { version: 1, itemId: item.id, model: provider.model, grades: {} };
  const grades = new Map<number, FrameGrade>();
  let prev: { hash: FrameHash; grade: FrameGrade } | null = null;
  let graded = 0;
  let reused = 0;
  let sinceSave = 0;
  const total = times.length + 1; // +1 leaves headroom for refine/yaw work

  for (let i = 0; i < times.length; i++) {
    checkAborted(signal);
    const t = times[i];
    const k = Math.round(t / SAMPLE_STEP_SEC);
    if (k >= extraction.frameCount) break;
    const hash = hashes[k];

    let grade: FrameGrade | undefined = partial.grades[String(t)];
    if (!grade && prev && hammingDistance(prev.hash, hash) <= CURATION.dedupHamming) {
      grade = prev.grade;
      reused += 1;
    }
    if (!grade) {
      const jpeg = await fsp.readFile(extraction.framePath(k)).catch(() => null);
      if (!jpeg) continue;
      grade = await provider.gradeFrame(jpeg, { signal, label: `${item.name}@${t}s` });
      graded += 1;
      partial.grades[String(t)] = grade;
      sinceSave += 1;
      if (sinceSave >= CURATION.partialEvery) {
        await savePartial(partial);
        sinceSave = 0;
      }
    }
    grades.set(t, grade);
    prev = { hash, grade };
    onProgress?.((i + 1) / total);
  }
  if (sinceSave > 0) await savePartial(partial);

  // 4. Fuse + pick peaks.
  const motion = perSecondMotionScore(track);
  const candidates: Candidate[] = [];
  grades.forEach((grade, t) => {
    const c = fuseCandidate(t, grade, track, motion);
    if (c) candidates.push(c);
  });
  const peaks = selectPeaks(candidates, durationSec);

  // 5–6. Refine each window and, for 360, choose the view.
  const highlights: HighlightWindow[] = [];
  for (let i = 0; i < peaks.length; i++) {
    checkAborted(signal);
    const peak = peaks[i];
    const refined = await measureWindow(input, {
      ...ffmpegOpts,
      signal,
      layout,
      fromSec: peak.t - CURATION.refineRadiusSec,
      durationSec: CURATION.refineRadiusSec * 2,
      outDir: path.join(tmpDir, 'refine'),
    }).catch((err) => {
      log.warn('refine failed; centring on sample', { item: item.name, t: peak.t, error: (err as Error).message });
      return { t: [], motion: [], sharpness: [] } as RefineSamples;
    });
    const window = refineWindow(refined, peak.t, durationSec);

    let view: HighlightView | undefined;
    let faces = peak.grade.faces;
    if (is360) {
      const chosen = await pickView(input, layout as 'dual-fisheye-sbs' | 'dual-fisheye-streams', peak, { ...ffmpegOpts, signal, provider, tmpDir });
      view = chosen.view;
      faces = faces || chosen.grade.faces;
      graded += chosen.graded;
    }

    highlights.push({
      index: i,
      start: window.start,
      end: window.end,
      sampleT: peak.t,
      score: peak.score,
      caption: peak.grade.caption,
      scene: peak.grade.scene,
      people: peak.grade.people || faces,
      faces,
      view,
      proxy: is360 ? 'pending' : undefined,
    });
    onProgress?.((times.length + (i + 1) / peaks.length) / total);
  }

  highlights.sort((a, b) => b.score - a.score);
  highlights.forEach((h, i) => (h.index = i));

  const record: CurationRecord = {
    version: 1,
    itemId: item.id,
    kind: 'video',
    provider: provider.name,
    model: provider.model,
    createdAt: Date.now(),
    durationMs: Date.now() - started,
    score: highlights[0]?.score ?? 0,
    grade: highlights[0] ? grades.get(highlights[0].sampleT) : undefined,
    highlights,
    stats: { sampled: times.length, graded, reused, candidates: candidates.length },
  };
  await clearPartial(item.id);
  log.info('curated', {
    item: item.name,
    durationSec: Math.round(durationSec),
    sampled: times.length,
    graded,
    reused,
    highlights: highlights.length,
    score: record.score,
    seconds: Math.round(record.durationMs / 1000),
  });
  return record;
}

/**
 * Render the yaw candidates at the peak moment and let the model pick. If the
 * whole-sphere grade saw faces and no yaw candidate did, also try looking
 * down — people are usually below a hand-held 360 camera.
 */
async function pickView(
  input: string,
  layout: 'dual-fisheye-sbs' | 'dual-fisheye-streams',
  peak: Candidate,
  opts: FfmpegOptions & { signal: AbortSignal; provider: VisionProvider; tmpDir: string },
): Promise<{ view: HighlightView; grade: FrameGrade; graded: number }> {
  const { provider, tmpDir, signal, ...ffmpegOpts } = opts;
  const outDir = path.join(tmpDir, 'views');

  const gradeViews = async (views: HighlightView[]) => {
    const files = await renderViewCandidates(input, { ...ffmpegOpts, signal, layout, atSec: peak.t, views, outDir });
    const graded: Array<{ view: HighlightView; grade: FrameGrade }> = [];
    for (let i = 0; i < files.length; i++) {
      checkAborted(signal);
      const jpeg = await fsp.readFile(files[i]).catch(() => null);
      if (!jpeg) continue;
      graded.push({ view: views[i], grade: await provider.gradeFrame(jpeg, { signal, label: `view ${views[i].lens}/${views[i].yawDeg}` }) });
    }
    return graded;
  };

  let results = await gradeViews(defaultViewCandidates());
  if (peak.grade.faces && !results.some((r) => r.grade.faces)) results = results.concat(await gradeViews(pitchedViewCandidates()));

  const best = results.reduce<{ view: HighlightView; grade: FrameGrade } | null>((acc, r) => (!acc || viewScore(r.grade) > viewScore(acc.grade) ? r : acc), null);
  return {
    view: best?.view ?? { lens: 'a', yawDeg: 0, pitchDeg: 0 },
    grade: best?.grade ?? peak.grade,
    graded: results.length,
  };
}
