/**
 * 360° reframing with ffmpeg's v360 filter.
 *
 * Insta360 sources come in two shapes (see FrameLayout):
 *   dual-fisheye-streams — .insv: two square fisheye video streams
 *   dual-fisheye-sbs     — .lrv: both fisheye circles side by side in one frame
 *
 * Lens "a" is INSV stream 0, which is the RIGHT circle of the .lrv proxy
 * (verified against real X5 footage). Lens "b" is stream 1 / the left circle.
 *
 * Everything here only builds filter strings and argument arrays; execution
 * goes through runFfmpeg so priority, cancellation and timeouts are uniform.
 */

import { assertServer } from '../runtime';
import { runFfmpeg, type FfmpegOptions } from './ffmpeg';
import type { FrameLayout } from '@/types/library';

assertServer();

export type Lens = 'a' | 'b';

export interface ReframeView {
  yawDeg: number;
  pitchDeg: number;
  rollDeg?: number;
  hFovDeg: number;
  vFovDeg: number;
}

/** A natural "action-cam" look: wide but not distorted. */
export const DEFAULT_VIEW: ReframeView = { yawDeg: 0, pitchDeg: 0, hFovDeg: 100, vFovDeg: 70 };

/** Insta360 X-series lenses cover roughly 200° each. */
export const LENS_FOV_DEG = 200;

export interface OutputSize {
  width: number;
  height: number;
}

/** Crop one lens out of a side-by-side dual-fisheye frame. */
export function sbsLensCropFilter(lens: Lens): string {
  return lens === 'a' ? 'crop=iw/2:ih:iw/2:0' : 'crop=iw/2:ih:0:0';
}

/** Single fisheye circle → rectilinear (flat) perspective. */
export function fisheyeToFlatFilter(view: ReframeView, size: OutputSize, lensFov = LENS_FOV_DEG): string {
  const parts = [
    'v360=input=fisheye',
    `ih_fov=${lensFov}`,
    `iv_fov=${lensFov}`,
    'output=rectilinear',
    `h_fov=${view.hFovDeg}`,
    `v_fov=${view.vFovDeg}`,
    `w=${size.width}`,
    `h=${size.height}`,
    `yaw=${view.yawDeg}`,
    `pitch=${view.pitchDeg}`,
    `roll=${view.rollDeg ?? 0}`,
  ];
  return parts.join(':');
}

/**
 * Build the -map and -vf pieces that turn a 360 source into a flat view.
 * Returns null for flat sources (no reframe needed).
 */
export function flatViewFilter(
  layout: FrameLayout,
  lens: Lens,
  view: ReframeView,
  size: OutputSize,
): { mapArgs: string[]; filter: string } | null {
  switch (layout) {
    case 'dual-fisheye-streams':
      return {
        mapArgs: ['-map', lens === 'a' ? '0:v:0' : '0:v:1'],
        filter: fisheyeToFlatFilter(view, size),
      };
    case 'dual-fisheye-sbs':
      return {
        mapArgs: ['-map', '0:v:0'],
        filter: `${sbsLensCropFilter(lens)},${fisheyeToFlatFilter(view, size)}`,
      };
    case 'flat':
    default:
      return null;
  }
}

export interface RenderProxyOptions extends Omit<FfmpegOptions, 'durationSec'> {
  layout: FrameLayout;
  lens?: Lens;
  view?: ReframeView;
  size?: OutputSize;
  /** Optional trim window in seconds. */
  trimStartSec?: number;
  trimDurationSec?: number;
  /** Full source duration — used for progress when not trimming. */
  sourceDurationSec?: number;
  /** Source has an audio stream to carry over. */
  hasAudio: boolean;
  /** Video bitrate for the hardware encoder. */
  bitrate?: string;
}

/**
 * Render a flat, browser-playable H.264 MP4 from a 360 source. Uses the
 * VideoToolbox encoder on macOS and libx264 elsewhere.
 */
export async function renderFlatProxy(inputPath: string, outputPath: string, opts: RenderProxyOptions): Promise<void> {
  const {
    layout,
    lens = 'a',
    view = DEFAULT_VIEW,
    size = { width: 1280, height: 720 },
    trimStartSec,
    trimDurationSec,
    sourceDurationSec,
    hasAudio,
    bitrate = '6M',
    ...ffmpegOpts
  } = opts;

  const reframe = flatViewFilter(layout, lens, view, size);
  const inputArgs: string[] = [];
  if (trimStartSec !== undefined) inputArgs.push('-ss', trimStartSec.toFixed(3));
  if (trimDurationSec !== undefined) inputArgs.push('-t', trimDurationSec.toFixed(3));
  inputArgs.push('-i', inputPath);

  const videoFilter = reframe?.filter ?? `scale=${size.width}:${size.height}:force_original_aspect_ratio=decrease,pad=${size.width}:${size.height}:(ow-iw)/2:(oh-ih)/2`;
  const encoder =
    process.platform === 'darwin'
      ? ['-c:v', 'h264_videotoolbox', '-b:v', bitrate, '-maxrate', bitrate, '-bufsize', '12M', '-profile:v', 'high', '-allow_sw', '1']
      : ['-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23'];

  const restArgs = [
    ...(reframe?.mapArgs ?? ['-map', '0:v:0']),
    ...(hasAudio ? ['-map', '0:a:0?'] : ['-an']),
    '-vf', videoFilter,
    '-pix_fmt', 'yuv420p',
    ...encoder,
    ...(hasAudio ? ['-c:a', 'aac', '-b:a', '128k', '-ac', '2'] : []),
    '-movflags', '+faststart',
    '-f', 'mp4',
    outputPath,
  ];

  await runFfmpeg(inputArgs, restArgs, {
    ...ffmpegOpts,
    durationSec: trimDurationSec ?? sourceDurationSec,
  });
}
