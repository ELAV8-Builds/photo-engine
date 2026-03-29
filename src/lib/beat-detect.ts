/**
 * Beat Detection — analyze audio for beat positions using Web Audio API.
 *
 * Uses peak detection on frequency energy to identify beat onsets.
 * Returns an array of beat timestamps that can be used to align
 * template slot transitions with the music.
 *
 * Algorithm:
 * 1. Decode audio to PCM
 * 2. Compute energy in short windows (~43ms / 1024 samples at 44.1kHz)
 * 3. Compare each window's energy to a local average (sensitivity threshold)
 * 4. Peaks above threshold = beat onsets
 * 5. Apply minimum beat spacing to avoid double-triggers
 */

export interface BeatInfo {
  /** Array of beat timestamps in seconds */
  beats: number[];
  /** Estimated BPM */
  bpm: number;
  /** Audio duration in seconds */
  duration: number;
}

/**
 * Detect beats in an audio track.
 *
 * @param audioSource - URL, File, or Blob of the audio
 * @param sensitivity - Beat detection sensitivity (0-1, default 0.6). Higher = more beats detected.
 * @returns BeatInfo with beat positions and estimated BPM
 */
export async function detectBeats(
  audioSource: string | File | Blob,
  sensitivity: number = 0.6,
): Promise<BeatInfo> {
  // Decode audio
  const audioCtx = new OfflineAudioContext(1, 1, 44100); // temporary for decoding
  let arrayBuffer: ArrayBuffer;

  if (typeof audioSource === 'string') {
    const response = await fetch(audioSource);
    arrayBuffer = await response.arrayBuffer();
  } else if (audioSource instanceof File || audioSource instanceof Blob) {
    arrayBuffer = await audioSource.arrayBuffer();
  } else {
    throw new Error('Invalid audio source');
  }

  // Re-create with proper length after we know the duration
  const tempBuffer = await audioCtx.decodeAudioData(arrayBuffer.slice(0));
  const duration = tempBuffer.duration;
  const sampleRate = tempBuffer.sampleRate;
  const samples = tempBuffer.getChannelData(0);

  // Compute energy in windows
  const windowSize = 1024; // ~23ms at 44.1kHz
  const hopSize = 512;     // 50% overlap
  const windowCount = Math.floor((samples.length - windowSize) / hopSize);
  const energies: number[] = [];

  for (let i = 0; i < windowCount; i++) {
    const start = i * hopSize;
    let energy = 0;
    for (let j = 0; j < windowSize; j++) {
      const sample = samples[start + j];
      energy += sample * sample;
    }
    energies.push(energy / windowSize);
  }

  // Detect peaks: compare each energy to local average
  const localWindowSize = 43; // ~1 second of context
  const threshold = 1.0 + (1.0 - sensitivity) * 1.5; // Higher sensitivity = lower threshold
  const minBeatSpacing = 0.25; // Minimum 250ms between beats

  const beats: number[] = [];
  let lastBeatTime = -1;

  for (let i = localWindowSize; i < energies.length - localWindowSize; i++) {
    // Local average energy
    let localSum = 0;
    for (let j = i - localWindowSize; j <= i + localWindowSize; j++) {
      localSum += energies[j];
    }
    const localAvg = localSum / (localWindowSize * 2 + 1);

    // Is this a peak?
    if (energies[i] > localAvg * threshold && energies[i] >= energies[i - 1] && energies[i] >= energies[i + 1]) {
      const beatTime = (i * hopSize) / sampleRate;

      // Enforce minimum spacing
      if (beatTime - lastBeatTime >= minBeatSpacing) {
        beats.push(Math.round(beatTime * 1000) / 1000); // Round to ms
        lastBeatTime = beatTime;
      }
    }
  }

  // Estimate BPM from average beat interval
  let bpm = 120; // default
  if (beats.length >= 2) {
    const intervals: number[] = [];
    for (let i = 1; i < beats.length; i++) {
      intervals.push(beats[i] - beats[i - 1]);
    }
    const avgInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length;
    bpm = Math.round(60 / avgInterval);
    // Clamp to reasonable range
    bpm = Math.max(60, Math.min(200, bpm));
  }

  return { beats, bpm, duration };
}

/**
 * Quantize slot durations to align transitions with beat positions.
 *
 * Strategy:
 * - Each slot transition should land on (or near) a beat
 * - Distribute beats among slots, adjusting durations to match
 * - Minimum slot duration enforced to prevent too-short slots
 *
 * @param slotCount - Number of template slots
 * @param beats - Array of beat timestamps
 * @param totalDuration - Total audio duration
 * @param minSlotDuration - Minimum seconds per slot (default 1.2)
 * @returns Array of adjusted slot durations
 */
export function quantizeSlotsToBeat(
  slotCount: number,
  beats: number[],
  totalDuration: number,
  minSlotDuration: number = 1.2,
): number[] {
  if (beats.length === 0 || slotCount === 0) {
    // No beats detected — even distribution
    const dur = totalDuration / slotCount;
    return Array(slotCount).fill(Math.max(dur, minSlotDuration));
  }

  // Strategy: assign beats to slots
  // Each slot gets N beats, where N = total beats / slot count (roughly)
  const beatsPerSlot = Math.max(1, Math.floor(beats.length / slotCount));
  const durations: number[] = [];
  let currentStart = 0;

  for (let s = 0; s < slotCount; s++) {
    if (s === slotCount - 1) {
      // Last slot gets the remainder
      const remaining = totalDuration - currentStart;
      durations.push(Math.max(remaining, minSlotDuration));
    } else {
      // Find the beat that's beatsPerSlot away from our start
      const targetBeatIdx = Math.min((s + 1) * beatsPerSlot, beats.length - 1);
      const targetTime = beats[targetBeatIdx];
      let slotDuration = targetTime - currentStart;

      // Enforce minimum duration
      if (slotDuration < minSlotDuration) {
        // Look for the next beat that gives us enough duration
        let bestBeatIdx = targetBeatIdx;
        for (let b = targetBeatIdx + 1; b < beats.length; b++) {
          if (beats[b] - currentStart >= minSlotDuration) {
            bestBeatIdx = b;
            break;
          }
        }
        slotDuration = Math.max(beats[bestBeatIdx] - currentStart, minSlotDuration);
      }

      durations.push(Math.round(slotDuration * 100) / 100);
      currentStart += slotDuration;
    }
  }

  return durations;
}

/**
 * Get strong beats (downbeats) — every Nth beat where N depends on BPM.
 * Useful for marking major transitions (vs. every single beat).
 */
export function getStrongBeats(beats: number[], bpm: number): number[] {
  // At normal tempos (100-130 BPM), every 4th beat is a downbeat
  // At fast tempos (130+), every 2nd beat
  // At slow tempos (<100), every 8th beat
  const interval = bpm >= 130 ? 2 : bpm >= 100 ? 4 : 8;
  return beats.filter((_, i) => i % interval === 0);
}
