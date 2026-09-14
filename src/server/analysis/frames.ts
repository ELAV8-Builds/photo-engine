/**
 * Frame extraction for curation — short ffmpeg calls that produce the small
 * JPEGs the vision model grades, plus the raw gray stream for hashing.
 *
 * 360 sources are read from the camera's .lrv proxy and unwrapped to a
 * 512×256 equirectangular panorama so one frame shows the whole sphere; the
 * default lens-A view frequently looks at a ceiling while the people are
 * behind the camera (measured on the X5 card). Flat sources are scaled to
 * 512 px wide.
 *
 * All calls go through runFfmpeg (nice, bounded threads, cancellation).
 */

import fsp from 'fs/promises';
import path from 'path';
import { assertServer } from '../runtime';
import { runFfmpeg, type FfmpegOptions } from '../media/ffmpeg';
import { fisheyeToFlatFilter, sbsLensCropFilter, type Lens } from '../media/reframe';
import { escapeFilterPath, parseMetadataPrint } from './signals';
import type { FrameLayout, HighlightView } from '@/types/library';

assertServer();

export const GRADE_FRAME_WIDTH = 512;
/** Every sampled frame sits on an even second; extraction runs at 0.5 fps. */
export const SAMPLE_STEP_SEC = 2;

/**
 * Pixel format the mjpeg encoder accepts without `-strict`. When VideoToolbox
 * falls back to software on a tiny clip the negotiated format can differ and
 * ffmpeg 7.1 refuses non-full-range YUV (measured on a 0.5 s LRV) — pin it.
 */
const JPEG_PIX_FMT = 'format=yuvj420p';

/** How the whole frame should look before grading. */
function sphereOrScaleFilter(layout: FrameLayout): string {
  switch (layout) {
    case 'dual-fisheye-sbs':
      return `v360=input=dfisheye:output=equirect:ih_fov=200:iv_fov=200:w=${GRADE_FRAME_WIDTH}:h=${GRADE_FRAME_WIDTH / 2},${JPEG_PIX_FMT}`;
    case 'dual-fisheye-streams':
      // Only lens A is available as one stream; grade its fisheye circle directly.
      return `scale=${GRADE_FRAME_WIDTH}:${GRADE_FRAME_WIDTH},${JPEG_PIX_FMT}`;
    default:
      return `scale=${GRADE_FRAME_WIDTH}:-2,${JPEG_PIX_FMT}`;
  }
}

export interface SampleExtraction {
  /** JPEG path for frame k (time = k × SAMPLE_STEP_SEC). Missing entries were not produced. */
  framePath: (k: number) => string;
  frameCount: number;
  /** Raw 16×16 gray, one PHASH_FRAME_BYTES block per frame, same indexing. */
  hashRaw: Buffer;
}

export interface ExtractSamplesOptions extends FfmpegOptions {
  layout: FrameLayout;
  durationSec: number;
  /** Job-scoped scratch dir; caller removes it. */
  outDir: string;
}

/**
 * One pass over the source: 0.5 fps → equirect/flat JPEGs named by frame index
 * (`-frame_pts 1` with the fps filter's timebase gives k = t / 2) and a raw
 * gray stream for perceptual hashing. Frames beyond usable seconds are cheap
 * to skip afterwards; deciding inside the filter graph would break the index.
 */
export async function extractSampleFrames(input: string, opts: ExtractSamplesOptions): Promise<SampleExtraction> {
  const { layout, durationSec, outDir, ...ffmpegOpts } = opts;
  await fsp.mkdir(outDir, { recursive: true });
  const hashFile = path.join(outDir, 'hash.raw');
  const pattern = path.join(outDir, 'f-%06d.jpg');

  const graph = [
    `[0:v:0]fps=1/${SAMPLE_STEP_SEC},split=2[h][g]`,
    `[h]scale=16:16:flags=area,format=gray[ho]`,
    `[g]${sphereOrScaleFilter(layout)}[go]`,
  ].join(';');

  await runFfmpeg(['-i', input], [
    '-filter_complex', graph,
    '-map', '[ho]', '-f', 'rawvideo', hashFile,
    '-map', '[go]', '-fps_mode', 'passthrough', '-frame_pts', '1', '-q:v', '3', '-f', 'image2', pattern,
  ], { ...ffmpegOpts, durationSec, timeoutMs: 60 * 60_000 });

  const hashRaw = await fsp.readFile(hashFile);
  const frameCount = Math.floor(hashRaw.length / 256);
  return {
    framePath: (k) => path.join(outDir, `f-${String(k).padStart(6, '0')}.jpg`),
    frameCount,
    hashRaw,
  };
}

// ---------------------------------------------------------------------------
// Yaw candidates for 360 highlights
// ---------------------------------------------------------------------------

/**
 * ±45° keeps a 100° view inside the 200° lens circle (at ±60° the edge of the
 * fisheye shows as a black crescent — measured). Three views per lens still
 * cover the full sphere.
 */
export const YAW_CANDIDATES_DEG = [-45, 0, 45] as const;
/** Tried when the sphere frame saw faces but no yaw candidate did: people are usually below the camera. */
export const PITCH_DOWN_DEG = -35;

export function defaultViewCandidates(): HighlightView[] {
  const out: HighlightView[] = [];
  for (const lens of ['a', 'b'] as Lens[]) for (const yawDeg of YAW_CANDIDATES_DEG) out.push({ lens, yawDeg, pitchDeg: 0 });
  return out;
}

export function pitchedViewCandidates(): HighlightView[] {
  return (['a', 'b'] as Lens[]).map((lens) => ({ lens, yawDeg: 0, pitchDeg: PITCH_DOWN_DEG }));
}

export interface RenderViewCandidatesOptions extends FfmpegOptions {
  /** The side-by-side .lrv (preferred) or a two-stream .insv. */
  layout: Extract<FrameLayout, 'dual-fisheye-sbs' | 'dual-fisheye-streams'>;
  atSec: number;
  views: HighlightView[];
  outDir: string;
  size?: { width: number; height: number };
}

/** Render every candidate view of one moment in a single ffmpeg call. Returns JPEG paths in `views` order. */
export async function renderViewCandidates(input: string, opts: RenderViewCandidatesOptions): Promise<string[]> {
  const { layout, atSec, views, outDir, size = { width: GRADE_FRAME_WIDTH, height: 288 }, ...ffmpegOpts } = opts;
  await fsp.mkdir(outDir, { recursive: true });

  const outputs = views.map((_, i) => path.join(outDir, `view-${atSec.toFixed(1)}-${i}.jpg`));
  const chains: string[] = [];
  const restArgs: string[] = [];

  if (layout === 'dual-fisheye-sbs') {
    const labels = views.map((_, i) => `[s${i}]`).join('');
    chains.push(`[0:v:0]split=${views.length}${labels}`);
    views.forEach((v, i) => {
      const flat = fisheyeToFlatFilter({ yawDeg: v.yawDeg, pitchDeg: v.pitchDeg, hFovDeg: 100, vFovDeg: 70 }, size);
      chains.push(`[s${i}]${sbsLensCropFilter(v.lens)},${flat},${JPEG_PIX_FMT}[o${i}]`);
    });
  } else {
    // Two streams: split each lens stream only as many ways as it is used.
    const byLens: Record<Lens, number[]> = { a: [], b: [] };
    views.forEach((v, i) => byLens[v.lens].push(i));
    for (const lens of ['a', 'b'] as Lens[]) {
      const idxs = byLens[lens];
      if (idxs.length === 0) continue;
      const stream = lens === 'a' ? '[0:v:0]' : '[0:v:1]';
      chains.push(`${stream}split=${idxs.length}${idxs.map((i) => `[s${i}]`).join('')}`);
      for (const i of idxs) {
        const v = views[i];
        chains.push(`[s${i}]${fisheyeToFlatFilter({ yawDeg: v.yawDeg, pitchDeg: v.pitchDeg, hFovDeg: 100, vFovDeg: 70 }, size)},${JPEG_PIX_FMT}[o${i}]`);
      }
    }
  }

  restArgs.push('-filter_complex', chains.join(';'));
  outputs.forEach((out, i) => restArgs.push('-map', `[o${i}]`, '-frames:v', '1', '-q:v', '3', '-f', 'image2', out));

  await runFfmpeg(['-ss', atSec.toFixed(3), '-i', input], restArgs, { ...ffmpegOpts, timeoutMs: 120_000 });
  return outputs;
}

// ---------------------------------------------------------------------------
// Fine-grained motion/sharpness for window refinement
// ---------------------------------------------------------------------------

export interface RefineSamples {
  t: number[];
  motion: number[];
  sharpness: number[];
}

/**
 * 2 fps scene-score + edge-energy over a short window (no model). Used to snap
 * a highlight onto its sharpest, liveliest seconds. Mirrors the Stage-1 graph
 * so the numbers are comparable.
 */
export async function measureWindow(
  input: string,
  opts: FfmpegOptions & { layout: FrameLayout; fromSec: number; durationSec: number; outDir: string },
): Promise<RefineSamples> {
  const { layout, fromSec, durationSec, outDir, ...ffmpegOpts } = opts;
  await fsp.mkdir(outDir, { recursive: true });
  const sceneFile = path.join(outDir, `refine-scene-${fromSec.toFixed(1)}.txt`);
  const edgeFile = path.join(outDir, `refine-edge-${fromSec.toFixed(1)}.txt`);
  const region = layout === 'dual-fisheye-sbs' ? `${sbsLensCropFilter('a')},crop=iw*0.7:ih*0.7,` : layout === 'dual-fisheye-streams' ? 'crop=iw*0.7:ih*0.7,' : '';
  const graph = [
    `[0:v:0]fps=2,${region}scale=320:-2:flags=area,format=yuv420p,split=2[a][b]`,
    `[a]select='gte(scene,0)',metadata=mode=print:key=lavfi.scene_score:file='${escapeFilterPath(sceneFile)}'[va]`,
    `[b]sobel,signalstats,metadata=mode=print:key=lavfi.signalstats.YAVG:file='${escapeFilterPath(edgeFile)}'[vb]`,
  ].join(';');

  await runFfmpeg(
    ['-ss', Math.max(0, fromSec).toFixed(3), '-t', durationSec.toFixed(3), '-i', input],
    ['-filter_complex', graph, '-map', '[va]', '-map', '[vb]', '-f', 'null', '-'],
    { ...ffmpegOpts, timeoutMs: 120_000 },
  );

  const scene = parseMetadataPrint(await fsp.readFile(sceneFile, 'utf8'), 'lavfi.scene_score');
  const edge = parseMetadataPrint(await fsp.readFile(edgeFile, 'utf8'), 'lavfi.signalstats.YAVG');
  const n = Math.min(scene.t.length, edge.t.length);
  // Timestamps restart at 0 after -ss; shift back to clip time.
  return {
    t: scene.t.slice(0, n).map((t) => t + Math.max(0, fromSec)),
    motion: scene.v.slice(0, n).map((v) => (Number.isFinite(v) ? v : 0)),
    sharpness: edge.v.slice(0, n).map((v) => (Number.isFinite(v) ? v : 0)),
  };
}
