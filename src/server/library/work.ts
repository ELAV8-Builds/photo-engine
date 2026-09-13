/**
 * Decides which background jobs an item still needs and enqueues them.
 * Shared by the scanner (initial pass) and the prepare handler (follow-ups),
 * so the "what work is outstanding" logic exists exactly once.
 */

import { assertServer } from '../runtime';
import { enqueue, PRIORITY, type EnqueueOptions } from '../jobs/queue';
import type { IndexedItem } from './index-store';

assertServer();

export function planItemJobs(item: IndexedItem): EnqueueOptions[] {
  const jobs: EnqueueOptions[] = [];
  const s = item.status;

  const needsPrepare = s.probe === 'pending' || s.thumb === 'pending';
  if (needsPrepare) {
    // Photos are cheap and parallelisable; video frames need the decode lane.
    jobs.push({ type: 'prepare', lane: item.kind === 'video' ? 'ffmpeg' : 'io', priority: PRIORITY.prepare, itemId: item.id, rootId: item.rootId });
    // Everything else depends on probe results; the prepare handler re-plans.
    return jobs;
  }

  if (item.kind === 'video' && s.proxy360 === 'pending') {
    jobs.push({ type: 'proxy360', lane: 'ffmpeg', priority: PRIORITY.proxy360, itemId: item.id, rootId: item.rootId });
  }
  if (item.kind === 'video' && s.signals === 'pending') {
    jobs.push({ type: 'signals', lane: 'ffmpeg', priority: PRIORITY.signals, itemId: item.id, rootId: item.rootId });
  }
  return jobs;
}

export function enqueueItemWork(item: IndexedItem): number {
  const jobs = planItemJobs(item);
  for (const j of jobs) enqueue(j);
  return jobs.length;
}
