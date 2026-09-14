/**
 * Phase 5 — 360 signature renders.
 *
 *  - renderPanProxy: a flat 1080p clip whose view *moves* through the window
 *    along model-chosen keyframes. ffmpeg's v360 accepts yaw/pitch as runtime
 *    commands (`sendcmd`); the commands are RELATIVE, so we emit eased deltas
 *    every 0.1 s (measured: 4 s pan at 720p from the .lrv in 1.5 s, no lens edges).
 *  - renderTinyPlanetProxy: stereographic "little planet" from the dual-fisheye
 *    .lrv in a single v360 pass (`output=sg`, pitch −90 looks straight down).
 *
 * Pure helpers (keyframe sampling, command text) are exported for tests; the
 * render functions only build argument arrays and hand off to runFfmpeg.
 */

import fsp from 'fs/promises';
import path from 'path';
import { assertServer } from '../runtime';
import { runFfmpeg, type FfmpegOptions } from './ffmpeg';
import { fisheyeToFlatFilter, sbsLensCropFilter, type Lens } from './reframe';
import { escapeFilterPath } from '../analysis/signals';
import type { FrameLayout, ViewKeyframe } from '@/types/library';

assertServer();

export const PAN_STEP_SEC = 0.1;
/** A pan below this total travel is not worth a separate clip. */
export const PAN_MIN_SWEEP_DEG = 10;
/** Above this the keyframes disagree too much to trust; fall back to a static view. */
export const PAN_MAX_SWEEP_DEG = 120;
/** Keep a 100° view inside the 200° lens (Phase 2 finding). */
export const PAN_YAW_LIMIT_DEG = 45;
export const PAN_PITCH_LIMIT_DEG = 35;

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** Smoothstep-style ease-in-out on 0..1. */
export function easeInOut(u: number): number {
  const x = clamp(u, 0, 1);
  return x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2;
}

/** Total yaw travel across a keyframe path (pitch travel counts half). */
export function pathSweepDeg(keyframes: ViewKeyframe[]): number {
  let sweep = 0;
  for (let i = 1; i < keyframes.length; i++) {
    sweep += Math.abs(keyframes[i].yawDeg - keyframes[i - 1].yawDeg) + 0.5 * Math.abs(keyframes[i].pitchDeg - keyframes[i - 1].pitchDeg);
  }
  return sweep;
}

/** View at clip time t, eased between the surrounding keyframes (held flat outside the path). */
export function viewAt(keyframes: ViewKeyframe[], t: number): { yawDeg: number; pitchDeg: number } {
  if (keyframes.length === 0) return { yawDeg: 0, pitchDeg: 0 };
  if (t <= keyframes[0].t) return { yawDeg: keyframes[0].yawDeg, pitchDeg: keyframes[0].pitchDeg };
  for (let i = 1; i < keyframes.length; i++) {
    const a = keyframes[i - 1];
    const b = keyframes[i];
    if (t <= b.t) {
      const u = b.t === a.t ? 1 : easeInOut((t - a.t) / (b.t - a.t));
      return { yawDeg: a.yawDeg + (b.yawDeg - a.yawDeg) * u, pitchDeg: a.pitchDeg + (b.pitchDeg - a.pitchDeg) * u };
    }
  }
  const last = keyframes[keyframes.length - 1];
  return { yawDeg: last.yawDeg, pitchDeg: last.pitchDeg };
}

/**
 * sendcmd script for a clip that starts at `clipStartSec` (source time) and
 * runs `durationSec`. Times in the script are relative to the clip start (the
 * `-ss` input seek resets timestamps). Each line adds the delta since the
 * previous step because v360 rotation commands accumulate.
 */
export function buildPanCommands(keyframes: ViewKeyframe[], clipStartSec: number, durationSec: number): { script: string; initial: { yawDeg: number; pitchDeg: number } } {
  const initial = viewAt(keyframes, clipStartSec);
  const lines: string[] = [];
  let prev = initial;
  const steps = Math.floor(durationSec / PAN_STEP_SEC);
  for (let i = 1; i <= steps; i++) {
    const tRel = i * PAN_STEP_SEC;
    const v = viewAt(keyframes, clipStartSec + tRel);
    const dYaw = v.yawDeg - prev.yawDeg;
    const dPitch = v.pitchDeg - prev.pitchDeg;
    if (Math.abs(dYaw) > 1e-3 || Math.abs(dPitch) > 1e-3) {
      const cmds: string[] = [];
      if (Math.abs(dYaw) > 1e-3) cmds.push(`v360 yaw ${dYaw.toFixed(4)}`);
      if (Math.abs(dPitch) > 1e-3) cmds.push(`v360 pitch ${dPitch.toFixed(4)}`);
      lines.push(`${tRel.toFixed(2)} ${cmds.join(', ')};`);
    }
    prev = v;
  }
  return { script: lines.join('\n') + (lines.length ? '\n' : ''), initial };
}

/** Clamp a model-chosen keyframe path to what the lens can show. */
export function clampPath(keyframes: ViewKeyframe[]): ViewKeyframe[] {
  return keyframes.map((k) => ({ t: k.t, yawDeg: clamp(k.yawDeg, -PAN_YAW_LIMIT_DEG, PAN_YAW_LIMIT_DEG), pitchDeg: clamp(k.pitchDeg, -PAN_PITCH_LIMIT_DEG, PAN_PITCH_LIMIT_DEG) }));
}

export interface RenderPanOptions extends Omit<FfmpegOptions, 'durationSec'> {
  layout: Extract<FrameLayout, 'dual-fisheye-streams' | 'dual-fisheye-sbs'>;
  lens: Lens;
  path: ViewKeyframe[];
  /** Source-time window to cut (margins already applied). */
  startSec: number;
  durationSec: number;
  hasAudio: boolean;
  /** Job scratch dir for the sendcmd script. */
  tmpDir: string;
  size?: { width: number; height: number };
  bitrate?: string;
}

/** Flat H.264 clip with a moving view. VideoToolbox encoder on macOS. */
export async function renderPanProxy(inputPath: string, outputPath: string, opts: RenderPanOptions): Promise<void> {
  const { layout, lens, path: keyframes, startSec, durationSec, hasAudio, tmpDir, size = { width: 1920, height: 1080 }, bitrate = '12M', ...ffmpegOpts } = opts;
  await fsp.mkdir(tmpDir, { recursive: true });
  const { script, initial } = buildPanCommands(keyframes, startSec, durationSec);
  const cmdFile = path.join(tmpDir, `pan-${path.basename(outputPath)}.cmd`);
  await fsp.writeFile(cmdFile, script, 'utf8');

  const flat = fisheyeToFlatFilter({ yawDeg: initial.yawDeg, pitchDeg: initial.pitchDeg, hFovDeg: 100, vFovDeg: 70 }, size);
  const chain = [`sendcmd=f='${escapeFilterPath(cmdFile)}'`, ...(layout === 'dual-fisheye-sbs' ? [sbsLensCropFilter(lens)] : []), flat].join(',');
  const mapArgs = layout === 'dual-fisheye-streams' ? ['-map', lens === 'a' ? '0:v:0' : '0:v:1'] : ['-map', '0:v:0'];
  const encoder =
    process.platform === 'darwin'
      ? ['-c:v', 'h264_videotoolbox', '-b:v', bitrate, '-maxrate', bitrate, '-bufsize', '12M', '-profile:v', 'high', '-allow_sw', '1']
      : ['-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23'];

  await runFfmpeg(
    ['-ss', startSec.toFixed(3), '-t', durationSec.toFixed(3), '-i', inputPath],
    [
      ...mapArgs,
      ...(hasAudio ? ['-map', '0:a:0?'] : ['-an']),
      '-vf', chain,
      '-pix_fmt', 'yuv420p',
      ...encoder,
      ...(hasAudio ? ['-c:a', 'aac', '-b:a', '128k', '-ac', '2'] : []),
      '-movflags', '+faststart',
      '-f', 'mp4',
      outputPath,
    ],
    { ...ffmpegOpts, durationSec },
  );
}

export interface RenderPlanetOptions extends Omit<FfmpegOptions, 'durationSec'> {
  /** The side-by-side dual-fisheye source (.lrv). */
  startSec: number;
  durationSec: number;
  hasAudio: boolean;
  size?: number;
  bitrate?: string;
}

/** Square stereographic "tiny planet" clip from the dual-fisheye .lrv. */
export async function renderTinyPlanetProxy(lrvPath: string, outputPath: string, opts: RenderPlanetOptions): Promise<void> {
  const { startSec, durationSec, hasAudio, size = 1080, bitrate = '10M', ...ffmpegOpts } = opts;
  const filter = `v360=input=dfisheye:ih_fov=200:iv_fov=200:output=sg:h_fov=250:v_fov=250:w=${size}:h=${size}:pitch=-90`;
  const encoder =
    process.platform === 'darwin'
      ? ['-c:v', 'h264_videotoolbox', '-b:v', bitrate, '-maxrate', bitrate, '-bufsize', '10M', '-profile:v', 'high', '-allow_sw', '1']
      : ['-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23'];
  await runFfmpeg(
    ['-ss', startSec.toFixed(3), '-t', durationSec.toFixed(3), '-i', lrvPath],
    [
      '-map', '0:v:0',
      ...(hasAudio ? ['-map', '0:a:0?'] : ['-an']),
      '-vf', filter,
      '-pix_fmt', 'yuv420p',
      ...encoder,
      ...(hasAudio ? ['-c:a', 'aac', '-b:a', '128k', '-ac', '2'] : []),
      '-movflags', '+faststart',
      '-f', 'mp4',
      outputPath,
    ],
    { ...ffmpegOpts, durationSec },
  );
}

/** One flat frame at an arbitrary view — the yaw editor's preview. */
export async function renderViewFrame(
  input: string,
  layout: Extract<FrameLayout, 'dual-fisheye-streams' | 'dual-fisheye-sbs'>,
  lens: Lens,
  view: { yawDeg: number; pitchDeg: number },
  atSec: number,
  outputPath: string,
  opts: FfmpegOptions = {},
): Promise<void> {
  const size = { width: 640, height: 360 };
  const flat = fisheyeToFlatFilter({ yawDeg: view.yawDeg, pitchDeg: view.pitchDeg, hFovDeg: 100, vFovDeg: 70 }, size);
  const chain = [...(layout === 'dual-fisheye-sbs' ? [sbsLensCropFilter(lens)] : []), flat, 'format=yuvj420p'].join(',');
  const mapArgs = layout === 'dual-fisheye-streams' ? ['-map', lens === 'a' ? '0:v:0' : '0:v:1'] : ['-map', '0:v:0'];
  await runFfmpeg(['-ss', atSec.toFixed(3), '-i', input], [...mapArgs, '-frames:v', '1', '-vf', chain, '-q:v', '3', '-f', 'image2', outputPath], {
    ...opts,
    timeoutMs: 60_000,
  });
}
