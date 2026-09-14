/**
 * Stage-1 signal extraction: one low-priority ffmpeg pass per video that
 * measures brightness, motion/novelty, sharpness and loudness over time.
 *
 * The decode happens once (hardware-accelerated where available) and fans out
 * to three cheap filter branches whose results are written by ffmpeg's
 * `metadata=print` into temp files we parse afterwards. Nothing is
 * re-encoded. A 20-minute clip costs well under a minute on Apple silicon.
 */

import fsp from 'fs/promises';
import path from 'path';
import { assertServer, dataPath, fileExists, writeJsonAtomic } from '../runtime';
import { runFfmpeg, type FfmpegOptions } from '../media/ffmpeg';
import { sbsLensCropFilter } from '../media/reframe';
import { computeTechnicalVerdict } from './technical-score';
import type { IndexedItem } from '../library/index-store';
import type { SignalTrack } from '@/types/library';

assertServer();

export function signalsPath(itemId: string): string {
  return dataPath('analysis', `${itemId}.signals.json`);
}

export async function loadSignals(itemId: string): Promise<SignalTrack | null> {
  const p = signalsPath(itemId);
  if (!(await fileExists(p))) return null;
  return JSON.parse(await fsp.readFile(p, 'utf8')) as SignalTrack;
}

/**
 * Parse ffmpeg `metadata=mode=print` output:
 *   frame:0    pts:0    pts_time:0
 *   lavfi.signalstats.YAVG=98.12
 */
export function parseMetadataPrint(text: string, key: string): { t: number[]; v: number[] } {
  const t: number[] = [];
  const v: number[] = [];
  let currentT: number | null = null;
  for (const rawLine of text.split('\n')) {
    const line = rawLine.trim();
    if (!line) continue;
    if (line.startsWith('frame:')) {
      const m = /pts_time:\s*(-?[\d.]+)/.exec(line);
      currentT = m ? Number(m[1]) : null;
      continue;
    }
    if (currentT === null) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    if (line.slice(0, eq) !== key) continue;
    const value = Number(line.slice(eq + 1));
    t.push(currentT);
    v.push(Number.isFinite(value) ? value : NaN);
  }
  return { t, v };
}

/** Region of the frame to measure — keeps fisheye black corners out of the stats. */
function analysisRegionFilter(item: IndexedItem, usingCameraProxy: boolean): string {
  const layout = usingCameraProxy ? 'dual-fisheye-sbs' : item.layout;
  switch (layout) {
    case 'dual-fisheye-sbs':
      // Lens A, then the central 70% of the circle.
      return `${sbsLensCropFilter('a')},crop=iw*0.7:ih*0.7`;
    case 'dual-fisheye-streams':
      return 'crop=iw*0.7:ih*0.7';
    default:
      return 'null';
  }
}

export interface ExtractSignalsOptions extends FfmpegOptions {
  sampleFps: number;
  /** Job-scoped scratch directory; caller removes it. */
  tmpDir: string;
}

/**
 * Run the measurement pass and persist a SignalTrack for the item.
 * Requires a completed probe (duration, audio presence).
 */
export async function extractSignals(item: IndexedItem, opts: ExtractSignalsOptions): Promise<SignalTrack> {
  const { sampleFps, tmpDir, ...ffmpegOpts } = opts;
  const durationSec = item.probe?.durationSec ?? 0;
  if (durationSec <= 0) throw new Error('Cannot analyse a video without a known duration');

  const useProxy = item.layout === 'dual-fisheye-streams' && !!item.cameraProxyAbsPath && (await fileExists(item.cameraProxyAbsPath));
  const input = useProxy ? item.cameraProxyAbsPath! : item.absPath;
  // The camera proxy is a single stream; the .insv has two. Both expose lens A on 0:v:0.
  const hasAudio = item.probe?.hasAudio ?? false;

  await fsp.mkdir(tmpDir, { recursive: true });
  const lumaFile = path.join(tmpDir, 'luma.txt');
  const sceneFile = path.join(tmpDir, 'scene.txt');
  const edgeFile = path.join(tmpDir, 'edge.txt');
  const audioFile = path.join(tmpDir, 'audio.txt');

  const region = analysisRegionFilter(item, useProxy);
  const videoGraph = [
    `[0:v:0]fps=${sampleFps},${region},scale=320:-2:flags=area,format=yuv420p,split=2[a][b]`,
    `[a]signalstats,metadata=mode=print:key=lavfi.signalstats.YAVG:file='${escapeFilterPath(lumaFile)}',` +
      `select='gte(scene,0)',metadata=mode=print:key=lavfi.scene_score:file='${escapeFilterPath(sceneFile)}'[va]`,
    `[b]sobel,signalstats,metadata=mode=print:key=lavfi.signalstats.YAVG:file='${escapeFilterPath(edgeFile)}'[vb]`,
  ];
  const audioGraph = hasAudio
    ? [
        `[0:a:0]aresample=48000,asetnsamples=n=48000:p=0,astats=metadata=1:reset=1,` +
          `ametadata=mode=print:key=lavfi.astats.Overall.RMS_level:file='${escapeFilterPath(audioFile)}'[aa]`,
      ]
    : [];

  const restArgs = [
    '-filter_complex', [...videoGraph, ...audioGraph].join(';'),
    '-map', '[va]', '-map', '[vb]',
    ...(hasAudio ? ['-map', '[aa]'] : []),
    '-f', 'null', '-',
  ];

  await runFfmpeg(['-i', input], restArgs, { ...ffmpegOpts, durationSec, timeoutMs: 45 * 60_000 });

  const luma = parseMetadataPrint(await fsp.readFile(lumaFile, 'utf8'), 'lavfi.signalstats.YAVG');
  const scene = parseMetadataPrint(await fsp.readFile(sceneFile, 'utf8'), 'lavfi.scene_score');
  const edge = parseMetadataPrint(await fsp.readFile(edgeFile, 'utf8'), 'lavfi.signalstats.YAVG');
  const audio = hasAudio && (await fileExists(audioFile))
    ? parseMetadataPrint(await fsp.readFile(audioFile, 'utf8'), 'lavfi.astats.Overall.RMS_level')
    : { t: [], v: [] };

  // Align by sample index; branches see identical frames after the split.
  const n = Math.min(luma.t.length, scene.t.length, edge.t.length);
  const t = luma.t.slice(0, n);
  const brightness = luma.v.slice(0, n);
  const motion = scene.v.slice(0, n).map((v) => (Number.isFinite(v) ? v : 0));
  const sharpness = edge.v.slice(0, n);

  // JSON has no NaN, so missing audio seconds are stored as null.
  const seconds = Math.max(1, Math.ceil(durationSec));
  const audioRmsDb = new Array<number | null>(seconds).fill(null);
  for (let i = 0; i < audio.t.length; i++) {
    const s = Math.floor(audio.t[i]);
    if (s >= 0 && s < seconds && Number.isFinite(audio.v[i])) audioRmsDb[s] = audio.v[i];
  }

  const track: SignalTrack = {
    version: 1,
    itemId: item.id,
    sampleFps,
    durationSec,
    t,
    brightness,
    motion,
    sharpness,
    audioRmsDb,
    perSecond: computeTechnicalVerdict({ t, brightness, motion, sharpness, audioRmsDb, durationSec }),
  };

  await writeJsonAtomic(signalsPath(item.id), track);
  return track;
}

/** ffmpeg filter option values need ':' and '\' escaped, and we wrap in quotes. */
export function escapeFilterPath(p: string): string {
  return p.replace(/\\/g, '\\\\').replace(/:/g, '\\:').replace(/'/g, "\\'");
}
