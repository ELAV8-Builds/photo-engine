/**
 * Background job queue.
 *
 * Design goals, in order: never make the machine feel busy; never lose work;
 * stay simple.
 *
 * - Lanes with fixed concurrency: `ffmpeg` (1) for decode-heavy work,
 *   `model` (1) reserved for Phase 2 inference, `io` (2) for cheap probing and
 *   photo thumbnails. At most three children ever run, and the heavy ones are
 *   serialised.
 * - Priority ordering within a lane so thumbnails appear before long analyses.
 * - Pause stops dequeuing; the current job finishes. Cancel aborts the running
 *   job through its AbortSignal.
 * - The durable state is the item index, not the queue: on restart the library
 *   service re-derives pending work from item statuses. So the queue itself is
 *   in-memory, stored on globalThis to survive Next.js dev hot reloads.
 * - Dedup: enqueueing an identical (type, itemId/rootId) while queued or running
 *   is a no-op.
 */

import crypto from 'crypto';
import { assertServer, globalSingleton } from '../runtime';
import { createLogger, errorMessage } from '../log';
import type { JobInfo, JobLane, JobState, JobType, QueueSnapshot } from '@/types/library';

assertServer();

const log = createLogger('jobs');

export const LANE_CONCURRENCY: Record<JobLane, number> = { ffmpeg: 1, model: 1, io: 2 };

/** Lower number runs first. */
export const PRIORITY = {
  scan: 0,
  prepare: 10,
  proxy360: 20,
  signals: 30,
} as const;

export interface JobContext {
  signal: AbortSignal;
  report(progress: number): void;
}

export type JobHandler = (job: JobInfo, ctx: JobContext) => Promise<void>;

interface InternalJob {
  info: JobInfo;
  priority: number;
  controller: AbortController;
}

interface QueueState {
  handlers: Map<JobType, JobHandler>;
  queued: InternalJob[];
  running: Map<string, InternalJob>;
  recent: JobInfo[];
  totals: Record<JobState, number>;
  paused: boolean;
  /** Prevents re-entrant pump() calls. */
  pumping: boolean;
}

const state = globalSingleton<QueueState>('__photoforge_queue', () => ({
  handlers: new Map(),
  queued: [],
  running: new Map(),
  recent: [],
  totals: { queued: 0, running: 0, done: 0, failed: 0, cancelled: 0 },
  paused: false,
  pumping: false,
}));

const RECENT_LIMIT = 30;

export function registerHandler(type: JobType, handler: JobHandler): void {
  // Re-registration on hot reload must replace, not duplicate.
  state.handlers.set(type, handler);
}

export interface EnqueueOptions {
  type: JobType;
  lane: JobLane;
  priority: number;
  itemId?: string;
  rootId?: string;
}

function dedupKey(j: Pick<JobInfo, 'type' | 'itemId' | 'rootId'>): string {
  return `${j.type}|${j.itemId ?? ''}|${j.rootId ?? ''}`;
}

/** Add a job. Returns the existing job if an identical one is queued or running. */
export function enqueue(opts: EnqueueOptions): JobInfo {
  const key = dedupKey(opts);
  const existing = state.queued.find((j) => dedupKey(j.info) === key) ?? runningJobs().find((j) => dedupKey(j.info) === key);
  if (existing) return existing.info;

  const info: JobInfo = {
    id: crypto.randomUUID(),
    type: opts.type,
    lane: opts.lane,
    state: 'queued',
    itemId: opts.itemId,
    rootId: opts.rootId,
    createdAt: Date.now(),
  };
  state.queued.push({ info, priority: opts.priority, controller: new AbortController() });
  state.totals.queued += 1;
  schedulePump();
  return info;
}

function runningJobs(): InternalJob[] {
  return Array.from(state.running.values());
}

function laneRunning(lane: JobLane): number {
  return runningJobs().filter((j) => j.info.lane === lane).length;
}

function takeNext(lane: JobLane): InternalJob | undefined {
  let bestIdx = -1;
  for (let i = 0; i < state.queued.length; i++) {
    const j = state.queued[i];
    if (j.info.lane !== lane) continue;
    if (bestIdx === -1) {
      bestIdx = i;
      continue;
    }
    const best = state.queued[bestIdx];
    if (j.priority < best.priority || (j.priority === best.priority && j.info.createdAt < best.info.createdAt)) bestIdx = i;
  }
  if (bestIdx === -1) return undefined;
  return state.queued.splice(bestIdx, 1)[0];
}

function schedulePump(): void {
  // Defer so callers that enqueue many jobs in a loop pay for one pump.
  queueMicrotask(pump);
}

function pump(): void {
  if (state.pumping || state.paused) return;
  state.pumping = true;
  try {
    for (const lane of Object.keys(LANE_CONCURRENCY) as JobLane[]) {
      while (laneRunning(lane) < LANE_CONCURRENCY[lane]) {
        const next = takeNext(lane);
        if (!next) break;
        start(next);
      }
    }
  } finally {
    state.pumping = false;
  }
}

function start(job: InternalJob): void {
  const handler = state.handlers.get(job.info.type);
  job.info.state = 'running';
  job.info.startedAt = Date.now();
  state.running.set(job.info.id, job);
  state.totals.queued = Math.max(0, state.totals.queued - 1);
  state.totals.running += 1;

  if (!handler) {
    finish(job, 'failed', `No handler registered for job type "${job.info.type}"`);
    return;
  }

  const ctx: JobContext = {
    signal: job.controller.signal,
    report: (p) => {
      job.info.progress = Math.max(0, Math.min(1, p));
    },
  };

  handler(job.info, ctx)
    .then(() => finish(job, job.controller.signal.aborted ? 'cancelled' : 'done'))
    .catch((err) => finish(job, job.controller.signal.aborted ? 'cancelled' : 'failed', errorMessage(err)));
}

function finish(job: InternalJob, result: Extract<JobState, 'done' | 'failed' | 'cancelled'>, error?: string): void {
  state.running.delete(job.info.id);
  state.totals.running = Math.max(0, state.totals.running - 1);
  state.totals[result] += 1;
  job.info.state = result;
  job.info.finishedAt = Date.now();
  if (error) job.info.error = error;
  if (result === 'failed') log.warn(`${job.info.type} failed`, { itemId: job.info.itemId, error });

  state.recent.unshift({ ...job.info });
  if (state.recent.length > RECENT_LIMIT) state.recent.length = RECENT_LIMIT;
  schedulePump();
}

export function pause(): void {
  state.paused = true;
  log.info('paused');
}

export function resume(): void {
  if (!state.paused) return;
  state.paused = false;
  log.info('resumed');
  schedulePump();
}

/** Abort a running job or drop a queued one. */
export function cancel(jobId: string): boolean {
  const running = state.running.get(jobId);
  if (running) {
    running.controller.abort();
    return true;
  }
  const idx = state.queued.findIndex((j) => j.info.id === jobId);
  if (idx !== -1) {
    const [job] = state.queued.splice(idx, 1);
    state.totals.queued = Math.max(0, state.totals.queued - 1);
    finish(job, 'cancelled');
    return true;
  }
  return false;
}

/** Drop every queued job and abort running ones (e.g. when a root is removed). */
export function cancelWhere(predicate: (job: JobInfo) => boolean): number {
  let n = 0;
  for (const job of [...state.queued]) {
    if (predicate(job.info)) {
      cancel(job.info.id);
      n += 1;
    }
  }
  for (const job of runningJobs()) {
    if (predicate(job.info)) {
      job.controller.abort();
      n += 1;
    }
  }
  return n;
}

export function snapshot(): QueueSnapshot {
  return {
    paused: state.paused,
    queued: state.queued.length,
    running: runningJobs().map((j) => ({ ...j.info })),
    totals: { ...state.totals, queued: state.queued.length, running: state.running.size },
    recent: state.recent.slice(0, RECENT_LIMIT),
  };
}

export function isIdle(): boolean {
  return state.queued.length === 0 && state.running.size === 0;
}
