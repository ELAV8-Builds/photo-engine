/**
 * Perceptual (average) hash over a 16×16 grayscale frame.
 *
 * ffmpeg hands us `scale=16:16,format=gray -f rawvideo` — 256 bytes per frame.
 * We pool 2×2 to an 8×8 grid, threshold at the mean and pack 64 bits into two
 * 32-bit words (no BigInt on the hot path). Two frames within a small Hamming
 * distance are the same shot, so the model only grades one of them.
 *
 * Pure functions; no I/O.
 */

export const PHASH_SIDE = 16;
export const PHASH_FRAME_BYTES = PHASH_SIDE * PHASH_SIDE;

/** 64-bit hash as two unsigned 32-bit halves. */
export interface FrameHash {
  hi: number;
  lo: number;
}

export function averageHash(gray16: Uint8Array | Buffer, offset = 0): FrameHash {
  const cells = new Float64Array(64);
  let sum = 0;
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x++) {
      const base = offset + (2 * y) * PHASH_SIDE + 2 * x;
      const v = gray16[base] + gray16[base + 1] + gray16[base + PHASH_SIDE] + gray16[base + PHASH_SIDE + 1];
      cells[y * 8 + x] = v;
      sum += v;
    }
  }
  const mean = sum / 64;
  let hi = 0;
  let lo = 0;
  for (let i = 0; i < 32; i++) if (cells[i] > mean) hi |= 1 << i;
  for (let i = 32; i < 64; i++) if (cells[i] > mean) lo |= 1 << (i - 32);
  return { hi: hi >>> 0, lo: lo >>> 0 };
}

function popcount32(v: number): number {
  v = v - ((v >>> 1) & 0x55555555);
  v = (v & 0x33333333) + ((v >>> 2) & 0x33333333);
  return (((v + (v >>> 4)) & 0x0f0f0f0f) * 0x01010101) >>> 24;
}

export function hammingDistance(a: FrameHash, b: FrameHash): number {
  return popcount32((a.hi ^ b.hi) >>> 0) + popcount32((a.lo ^ b.lo) >>> 0);
}

/** Split a raw 16×16 gray stream into one hash per frame. Ignores a trailing partial frame. */
export function hashesFromRaw(raw: Uint8Array | Buffer): FrameHash[] {
  const n = Math.floor(raw.length / PHASH_FRAME_BYTES);
  const out: FrameHash[] = new Array(n);
  for (let i = 0; i < n; i++) out[i] = averageHash(raw, i * PHASH_FRAME_BYTES);
  return out;
}
