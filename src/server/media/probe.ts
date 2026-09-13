/**
 * Media probing: dimensions, duration, codecs, audio — and best-effort capture
 * time from metadata when the filename did not carry one.
 */

import { assertServer } from '../runtime';
import { findTool } from './binaries';
import { run, runFfprobeJson } from './ffmpeg';
import type { MediaProbe } from '@/types/library';
import type { IndexedItem } from '../library/index-store';

assertServer();

interface FfprobeStream {
  codec_type?: string;
  codec_name?: string;
  width?: number;
  height?: number;
  r_frame_rate?: string;
  avg_frame_rate?: string;
  sample_rate?: string;
  side_data_list?: Array<{ rotation?: number }>;
  tags?: Record<string, string>;
}

interface FfprobeOutput {
  streams?: FfprobeStream[];
  format?: { duration?: string; tags?: Record<string, string> };
}

function parseFps(rate?: string): number | undefined {
  if (!rate) return undefined;
  const [n, d] = rate.split('/').map(Number);
  if (!n || !d) return undefined;
  const fps = n / d;
  return Number.isFinite(fps) && fps > 0 ? Math.round(fps * 1000) / 1000 : undefined;
}

const HEIF_EXT = new Set(['heic', 'heif']);

/** HEIC/HEIF report tile sizes through ffprobe; ask sips for the real dimensions. */
async function probeWithSips(absPath: string): Promise<MediaProbe> {
  const sips = findTool('sips');
  if (!sips) throw new Error('HEIC probing requires macOS sips');
  const res = await run(sips, ['-g', 'pixelWidth', '-g', 'pixelHeight', absPath], { timeoutMs: 20_000 });
  const width = Number(/pixelWidth:\s*(\d+)/.exec(res.stdout)?.[1]);
  const height = Number(/pixelHeight:\s*(\d+)/.exec(res.stdout)?.[1]);
  if (!width || !height) throw new Error('sips did not report image dimensions');
  return { width, height };
}

export async function probeMedia(item: Pick<IndexedItem, 'absPath' | 'ext' | 'kind'>, signal?: AbortSignal): Promise<MediaProbe> {
  if (item.kind === 'photo' && HEIF_EXT.has(item.ext)) return probeWithSips(item.absPath);

  const out = await runFfprobeJson<FfprobeOutput>(['-show_format', '-show_streams', item.absPath], { signal });
  const streams = out.streams ?? [];
  const video = streams.filter((s) => s.codec_type === 'video');
  const audio = streams.find((s) => s.codec_type === 'audio');
  const primary = video[0];
  if (!primary?.width || !primary?.height) throw new Error('No decodable image or video stream found');

  // Honour rotation metadata (phone videos) so width/height describe the display orientation.
  const rotation = Math.abs(primary.side_data_list?.find((d) => typeof d.rotation === 'number')?.rotation ?? 0) % 180;
  const [width, height] = rotation === 90 ? [primary.height, primary.width] : [primary.width, primary.height];

  const durationRaw = Number(out.format?.duration);
  return {
    width,
    height,
    durationSec: item.kind === 'video' && Number.isFinite(durationRaw) ? durationRaw : undefined,
    fps: item.kind === 'video' ? parseFps(primary.avg_frame_rate) ?? parseFps(primary.r_frame_rate) : undefined,
    videoCodec: primary.codec_name,
    videoStreams: video.length,
    hasAudio: !!audio,
    audioSampleRate: audio?.sample_rate ? Number(audio.sample_rate) : undefined,
  };
}

/**
 * Capture time from embedded metadata. Photos: exiftool (if installed).
 * Videos: container creation_time. Returns undefined when nothing reliable exists.
 */
export async function probeCaptureTime(item: Pick<IndexedItem, 'absPath' | 'kind'>, signal?: AbortSignal): Promise<number | undefined> {
  if (item.kind === 'photo') {
    const exiftool = findTool('exiftool');
    if (!exiftool) return undefined;
    try {
      const res = await run(
        exiftool,
        ['-q', '-q', '-s3', '-d', '%s', '-DateTimeOriginal', '-CreateDate', item.absPath],
        { timeoutMs: 20_000, signal },
      );
      const first = res.stdout.split('\n').map((l) => l.trim()).find((l) => /^\d{9,11}$/.test(l));
      return first ? Number(first) * 1000 : undefined;
    } catch {
      return undefined;
    }
  }

  try {
    const out = await runFfprobeJson<FfprobeOutput>(['-show_entries', 'format_tags=creation_time', item.absPath], { signal });
    const iso = out.format?.tags?.creation_time;
    if (!iso) return undefined;
    const t = Date.parse(iso);
    // Some cameras write the Unix epoch when the clock was unset.
    return Number.isFinite(t) && t > Date.UTC(2000, 0, 1) ? t : undefined;
  } catch {
    return undefined;
  }
}
