/**
 * Thermal watchdog (macOS): poll `pmset -g therm` once a minute and pause the
 * queue while the OS reports CPU speed limiting. Two consecutive clean
 * readings lift the pause. Background curation should never be the reason
 * the fans spin up.
 */

import { assertServer, globalSingleton } from '../runtime';
import { createLogger } from '../log';
import { run } from '../media/ffmpeg';
import { setThermalPause } from './queue';

assertServer();

const log = createLogger('thermal');

export const THERMAL_POLL_MS = 60_000;
const CLEAN_READINGS_TO_RESUME = 2;
const PMSET = '/usr/bin/pmset';

interface WatchdogState {
  timer: NodeJS.Timeout | null;
  cleanStreak: number;
  lastLimit: number | null;
}

const state = globalSingleton<WatchdogState>('__photoforge_thermal', () => ({ timer: null, cleanStreak: 0, lastLimit: null }));

/** CPU_Speed_Limit from pmset output, or null when the line is absent (no throttling recorded). */
export function parseCpuSpeedLimit(text: string): number | null {
  const m = /CPU_Speed_Limit\s*=\s*(\d+)/.exec(text);
  return m ? Number(m[1]) : null;
}

export async function readCpuSpeedLimit(): Promise<number | null> {
  try {
    const res = await run(PMSET, ['-g', 'therm'], { timeoutMs: 10_000 });
    return parseCpuSpeedLimit(res.stdout);
  } catch {
    return null;
  }
}

async function tick(): Promise<void> {
  const limit = await readCpuSpeedLimit();
  state.lastLimit = limit;
  const throttled = limit !== null && limit < 100;
  if (throttled) {
    state.cleanStreak = 0;
    setThermalPause(true);
    log.warn('CPU speed limited; pausing background work', { limit });
    return;
  }
  state.cleanStreak += 1;
  if (state.cleanStreak >= CLEAN_READINGS_TO_RESUME) setThermalPause(false);
}

/** Idempotent; survives dev hot reloads via globalThis. No-op off macOS. */
export function startThermalWatchdog(): void {
  if (process.platform !== 'darwin' || state.timer) return;
  state.timer = setInterval(() => void tick(), THERMAL_POLL_MS);
  state.timer.unref();
}

export function lastCpuSpeedLimit(): number | null {
  return state.lastLimit;
}
