/**
 * MP4 Encoder — wraps ffmpeg.wasm for client-side H.264 MP4 encoding.
 *
 * Flow:
 *   1. init() — load ffmpeg.wasm core (one-time, cached)
 *   2. addFrame(canvas, frameNumber) — capture canvas as JPEG, write to virtual FS
 *   3. addAudio(audioBlob) — write audio file to virtual FS
 *   4. encode(fps, totalFrames) — run ffmpeg to mux frames + audio → MP4
 *   5. getOutputBlob() — read the output MP4 and return as Blob
 *   6. cleanup() — free virtual FS
 */

import { FFmpeg } from '@ffmpeg/ffmpeg';
import { toBlobURL, fetchFile } from '@ffmpeg/util';

let ffmpegInstance: FFmpeg | null = null;
let ffmpegLoaded = false;
let ffmpegLoading: Promise<void> | null = null;

/**
 * Initialize ffmpeg.wasm (singleton — loads once, reuses across exports).
 * Uses the UMD build which doesn't require SharedArrayBuffer.
 */
export async function initFFmpeg(
  onProgress?: (msg: string) => void,
): Promise<FFmpeg> {
  if (ffmpegInstance && ffmpegLoaded) return ffmpegInstance;

  if (ffmpegLoading) {
    await ffmpegLoading;
    return ffmpegInstance!;
  }

  ffmpegInstance = new FFmpeg();

  // Log progress
  ffmpegInstance.on('log', ({ message }) => {
    if (onProgress && message) {
      onProgress(message);
    }
  });

  ffmpegLoading = (async () => {
    onProgress?.('Loading video encoder...');

    // Use CDN for core files — UMD build (no SharedArrayBuffer needed)
    const baseURL = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd';

    try {
      await ffmpegInstance!.load({
        coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript'),
        wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm'),
      });
      ffmpegLoaded = true;
      onProgress?.('Video encoder ready');
    } catch (err) {
      ffmpegInstance = null;
      ffmpegLoading = null;
      throw new Error(
        `Failed to load ffmpeg.wasm: ${err instanceof Error ? err.message : 'Unknown error'}. ` +
        'This may be due to network restrictions or browser compatibility.',
      );
    }
  })();

  await ffmpegLoading;
  return ffmpegInstance!;
}

/**
 * Capture a canvas frame as JPEG and write it to ffmpeg's virtual filesystem.
 * Uses JPEG instead of PNG for ~5x smaller files and faster encoding.
 */
export async function writeFrame(
  ffmpeg: FFmpeg,
  canvas: HTMLCanvasElement,
  frameNumber: number,
  quality: number = 0.92,
): Promise<void> {
  const fileName = `frame_${String(frameNumber).padStart(6, '0')}.jpg`;

  // Canvas → Blob → Uint8Array
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('Canvas toBlob failed'))),
      'image/jpeg',
      quality,
    );
  });

  const buffer = new Uint8Array(await blob.arrayBuffer());
  await ffmpeg.writeFile(fileName, buffer);
}

/**
 * Write audio data to ffmpeg's virtual filesystem.
 * Accepts raw audio Blob (WAV, MP3, AAC, etc.) or a File.
 */
export async function writeAudio(
  ffmpeg: FFmpeg,
  audioSource: Blob | File | string,
  fileName: string = 'audio.wav',
): Promise<string> {
  if (typeof audioSource === 'string') {
    // URL — fetch it
    const data = await fetchFile(audioSource);
    await ffmpeg.writeFile(fileName, data);
  } else {
    const buffer = new Uint8Array(await audioSource.arrayBuffer());
    await ffmpeg.writeFile(fileName, buffer);
  }
  return fileName;
}

/**
 * Mix multiple audio tracks into a single WAV file using Web Audio API.
 * Returns the mixed audio as a WAV Blob.
 */
export async function mixAudioTracks(
  tracks: Array<{ url: string; file?: File }>,
  totalDuration: number,
): Promise<Blob | null> {
  if (tracks.length === 0) return null;

  try {
    const audioCtx = new OfflineAudioContext(2, Math.ceil(totalDuration * 44100), 44100);

    let startOffset = 0;
    for (const track of tracks) {
      try {
        const audioUrl = track.file ? URL.createObjectURL(track.file) : track.url;
        const response = await fetch(audioUrl);
        const arrayBuf = await response.arrayBuffer();
        const decoded = await audioCtx.decodeAudioData(arrayBuf);

        const source = audioCtx.createBufferSource();
        source.buffer = decoded;
        source.connect(audioCtx.destination);
        source.start(startOffset);
        startOffset += decoded.duration;

        if (track.file) URL.revokeObjectURL(audioUrl);
      } catch {
        console.warn('[MP4Encoder] Failed to decode audio track, skipping');
      }
    }

    // Render the mixed audio
    const renderedBuffer = await audioCtx.startRendering();

    // Convert AudioBuffer → WAV Blob
    return audioBufferToWav(renderedBuffer);
  } catch (err) {
    console.warn('[MP4Encoder] Audio mixing failed:', err);
    return null;
  }
}

/**
 * Encode frames + optional audio into an MP4 file.
 * Returns the MP4 as a Blob.
 */
export async function encodeMP4(
  ffmpeg: FFmpeg,
  fps: number,
  totalFrames: number,
  hasAudio: boolean,
  onProgress?: (percent: number) => void,
): Promise<Blob> {
  // Track encoding progress via ffmpeg log
  let lastPercent = 0;
  const progressHandler = ({ message }: { message: string }) => {
    // Parse "frame=  123" from ffmpeg output
    const match = message.match(/frame=\s*(\d+)/);
    if (match && onProgress) {
      const currentFrame = parseInt(match[1], 10);
      const percent = Math.min(99, Math.round((currentFrame / totalFrames) * 100));
      if (percent > lastPercent) {
        lastPercent = percent;
        onProgress(percent);
      }
    }
  };

  ffmpeg.on('log', progressHandler);

  try {
    // Build ffmpeg command
    const args: string[] = [
      '-framerate', String(fps),
      '-i', 'frame_%06d.jpg',
    ];

    if (hasAudio) {
      args.push('-i', 'audio.wav');
    }

    args.push(
      '-c:v', 'libx264',
      '-preset', 'fast',         // Balance speed vs quality
      '-crf', '23',              // Good quality (18=best, 28=worse)
      '-pix_fmt', 'yuv420p',     // Maximum compatibility
      '-movflags', '+faststart', // Web-optimized (moov atom at start)
    );

    if (hasAudio) {
      args.push(
        '-c:a', 'aac',
        '-b:a', '192k',
        '-shortest',             // Trim to shorter of video/audio
      );
    }

    args.push('-y', 'output.mp4');

    await ffmpeg.exec(args);

    // Read the output — readFile returns FileData (Uint8Array | string)
    const data = await ffmpeg.readFile('output.mp4');
    // Create a fresh Uint8Array backed by a plain ArrayBuffer (not SharedArrayBuffer)
    // to satisfy strict TypeScript Blob typing
    const source = typeof data === 'string' ? new TextEncoder().encode(data) : data;
    const copy = new ArrayBuffer(source.byteLength);
    new Uint8Array(copy).set(source instanceof Uint8Array ? source : new Uint8Array(source as ArrayBuffer));
    const mp4Blob = new Blob([copy], { type: 'video/mp4' });

    if (mp4Blob.size < 1000) {
      throw new Error('Encoding produced an empty or corrupt MP4 file');
    }

    onProgress?.(100);
    return mp4Blob;

  } finally {
    ffmpeg.off('log', progressHandler);
  }
}

/**
 * Clean up all temporary files from ffmpeg's virtual filesystem.
 */
export async function cleanupFS(
  ffmpeg: FFmpeg,
  totalFrames: number,
): Promise<void> {
  try {
    // Delete frame files
    for (let i = 0; i < totalFrames; i++) {
      const fileName = `frame_${String(i).padStart(6, '0')}.jpg`;
      try {
        await ffmpeg.deleteFile(fileName);
      } catch {
        // File may not exist, that's fine
      }
    }

    // Delete audio and output
    try { await ffmpeg.deleteFile('audio.wav'); } catch { /* ok */ }
    try { await ffmpeg.deleteFile('output.mp4'); } catch { /* ok */ }
  } catch {
    // Cleanup failures are non-fatal
  }
}

// ====================================================================
//  AudioBuffer → WAV conversion
// ====================================================================

function audioBufferToWav(buffer: AudioBuffer): Blob {
  const numChannels = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
  const format = 1; // PCM
  const bitDepth = 16;

  const bytesPerSample = bitDepth / 8;
  const blockAlign = numChannels * bytesPerSample;
  const dataLength = buffer.length * blockAlign;
  const headerLength = 44;
  const totalLength = headerLength + dataLength;

  const arrayBuffer = new ArrayBuffer(totalLength);
  const view = new DataView(arrayBuffer);

  // WAV header
  writeString(view, 0, 'RIFF');
  view.setUint32(4, totalLength - 8, true);
  writeString(view, 8, 'WAVE');
  writeString(view, 12, 'fmt ');
  view.setUint32(16, 16, true);                   // fmt chunk size
  view.setUint16(20, format, true);                // PCM format
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true); // byte rate
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitDepth, true);
  writeString(view, 36, 'data');
  view.setUint32(40, dataLength, true);

  // Interleave channels and write PCM data
  const channels: Float32Array[] = [];
  for (let ch = 0; ch < numChannels; ch++) {
    channels.push(buffer.getChannelData(ch));
  }

  let offset = 44;
  for (let i = 0; i < buffer.length; i++) {
    for (let ch = 0; ch < numChannels; ch++) {
      const sample = Math.max(-1, Math.min(1, channels[ch][i]));
      view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7FFF, true);
      offset += 2;
    }
  }

  return new Blob([arrayBuffer], { type: 'audio/wav' });
}

function writeString(view: DataView, offset: number, str: string): void {
  for (let i = 0; i < str.length; i++) {
    view.setUint8(offset + i, str.charCodeAt(i));
  }
}
