/**
 * Server-side settings (performance profile today; model/provider settings in
 * later phases). Persisted as JSON in the app data directory.
 *
 * Secrets never belong here — Phase 4 keeps API keys in the browser and
 * forwards them per request.
 */

import { assertServer, dataPath, ensureDataDirs, readJson, writeJsonAtomic } from '../runtime';
import type { PerformanceProfile, ServerSettings } from '@/types/library';

assertServer();

const SETTINGS_FILE = () => dataPath('state', 'settings.json');

/**
 * Balanced by default: on a many-core Mac, 4 low-priority threads are
 * imperceptible while importing a full card in a reasonable time. `quiet`
 * halves that footprint for laptops or when the machine is busy.
 */
export const DEFAULT_SETTINGS: ServerSettings = {
  performanceProfile: 'balanced',
  visionModel: 'qwen3.5:9b',
};

const PROFILES: readonly PerformanceProfile[] = ['quiet', 'balanced', 'fast'];

export function isPerformanceProfile(value: unknown): value is PerformanceProfile {
  return typeof value === 'string' && (PROFILES as readonly string[]).includes(value);
}

/** Ollama model tags look like `qwen3.5:9b` or `library/name:tag`. */
const MODEL_TAG_RE = /^[A-Za-z0-9][A-Za-z0-9._\-\/]{0,79}(?::[A-Za-z0-9._\-]{1,40})?$/;

export function isModelTag(value: unknown): value is string {
  return typeof value === 'string' && MODEL_TAG_RE.test(value);
}

/** Concrete resource limits for each profile. Exactly one job per lane regardless. */
export interface ResourceBudget {
  /** Unix niceness for ffmpeg children (higher = lower priority). */
  nice: number;
  /** ffmpeg -threads for filtering/encoding. Decoding uses the media engine. */
  threads: number;
  /** Frames per second sampled for Stage-1 signals. */
  signalFps: number;
}

export function budgetFor(profile: PerformanceProfile): ResourceBudget {
  switch (profile) {
    case 'fast':
      return { nice: 5, threads: 8, signalFps: 2 };
    case 'balanced':
      return { nice: 15, threads: 4, signalFps: 2 };
    case 'quiet':
    default:
      return { nice: 19, threads: 2, signalFps: 1 };
  }
}

function sanitize(raw: Partial<ServerSettings> | null | undefined): ServerSettings {
  return {
    performanceProfile: isPerformanceProfile(raw?.performanceProfile)
      ? raw.performanceProfile
      : DEFAULT_SETTINGS.performanceProfile,
    visionModel: isModelTag(raw?.visionModel) ? raw.visionModel : DEFAULT_SETTINGS.visionModel,
  };
}

export async function getSettings(): Promise<ServerSettings> {
  await ensureDataDirs();
  const raw = await readJson<Partial<ServerSettings> | null>(SETTINGS_FILE(), null);
  return sanitize(raw);
}

export async function updateSettings(patch: Partial<ServerSettings>): Promise<ServerSettings> {
  const current = await getSettings();
  const next = sanitize({ ...current, ...patch });
  await writeJsonAtomic(SETTINGS_FILE(), next);
  return next;
}
