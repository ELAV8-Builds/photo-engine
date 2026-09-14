/**
 * Phase 5 — plan a view path across each 360 highlight window.
 *
 * Phase 2 chose one view at the window's peak frame (`HighlightWindow.view`).
 * Here the model also grades three same-lens yaws at the window's start and
 * end; the best of each becomes a keyframe, giving a path
 * start → peak → end. Small or wild sweeps collapse to a static view (no pan
 * clip); user-set views are never touched.
 */

import fsp from 'fs/promises';
import path from 'path';
import { assertServer } from '../runtime';
import { createLogger } from '../log';
import type { FfmpegOptions } from '../media/ffmpeg';
import type { IndexedItem } from '../library/index-store';
import type { VisionProvider } from '../ai/provider';
import { renderViewCandidates, YAW_CANDIDATES_DEG } from './frames';
import { viewScore } from './highlights';
import { clampPath, PAN_MAX_SWEEP_DEG, PAN_MIN_SWEEP_DEG, pathSweepDeg } from '../media/pan';
import type { CurationRecord, FrameGrade, HighlightView, HighlightWindow, ViewKeyframe } from '@/types/library';

assertServer();

const log = createLogger('pan');

/** Reduce three keyframes to the ones that matter; a flat path is a single keyframe. */
export function simplifyPath(keyframes: ViewKeyframe[]): ViewKeyframe[] {
  const out: ViewKeyframe[] = [];
  for (const k of keyframes) {
    const prev = out[out.length - 1];
    if (prev && Math.abs(prev.yawDeg - k.yawDeg) < 1 && Math.abs(prev.pitchDeg - k.pitchDeg) < 1) continue;
    out.push(k);
  }
  return out;
}

/** Decide whether a path should become a pan clip. */
export function panDecision(keyframes: ViewKeyframe[]): 'pan' | 'static' {
  const sweep = pathSweepDeg(keyframes);
  return keyframes.length >= 2 && sweep >= PAN_MIN_SWEEP_DEG && sweep <= PAN_MAX_SWEEP_DEG ? 'pan' : 'static';
}

export interface PlanPathsOptions extends FfmpegOptions {
  provider: VisionProvider;
  tmpDir: string;
  signal: AbortSignal;
  onProgress?: (fraction: number) => void;
}

/**
 * Fill `viewPath` (and pan/planet proxy states) for every window that has a
 * model-chosen view and no path yet. Returns the number of windows planned.
 */
export async function planViewPaths(item: IndexedItem, record: CurationRecord, opts: PlanPathsOptions): Promise<number> {
  const { provider, tmpDir, signal, onProgress, ...ffmpegOpts } = opts;
  const useCameraProxy = item.layout === 'dual-fisheye-streams' && !!item.cameraProxyAbsPath;
  const input = useCameraProxy ? item.cameraProxyAbsPath! : item.absPath;
  const layout = useCameraProxy ? 'dual-fisheye-sbs' : (item.layout as 'dual-fisheye-streams');
  const todo = record.highlights.filter((h) => h.view && !h.viewPath);
  let done = 0;

  for (const h of todo) {
    if (signal.aborted) throw new Error('Pan planning cancelled');
    const view = h.view!;
    if (view.source === 'user') {
      h.viewPath = [{ t: h.start, yawDeg: view.yawDeg, pitchDeg: view.pitchDeg }];
      h.planetProxy = h.planetProxy ?? 'pending';
      done += 1;
      continue;
    }

    const gradeAt = async (t: number): Promise<HighlightView> => {
      const views: HighlightView[] = YAW_CANDIDATES_DEG.map((yawDeg) => ({ lens: view.lens, yawDeg, pitchDeg: view.pitchDeg }));
      const files = await renderViewCandidates(input, { ...ffmpegOpts, signal, layout, atSec: Math.max(0, t), views, outDir: path.join(tmpDir, 'pan-views') });
      let best: { view: HighlightView; grade: FrameGrade } | null = null;
      for (let i = 0; i < files.length; i++) {
        if (signal.aborted) throw new Error('Pan planning cancelled');
        const jpeg = await fsp.readFile(files[i]).catch(() => null);
        if (!jpeg) continue;
        const grade = await provider.gradeFrame(jpeg, { signal, label: `pan ${item.name} @${t}s yaw ${views[i].yawDeg}` });
        if (!best || viewScore(grade) > viewScore(best.grade)) best = { view: views[i], grade };
      }
      return best?.view ?? view;
    };

    const startView = await gradeAt(h.start);
    const endView = await gradeAt(Math.max(h.start, h.end - 0.2));
    const raw: ViewKeyframe[] = [
      { t: h.start, yawDeg: startView.yawDeg, pitchDeg: startView.pitchDeg },
      { t: h.sampleT, yawDeg: view.yawDeg, pitchDeg: view.pitchDeg },
      { t: h.end, yawDeg: endView.yawDeg, pitchDeg: endView.pitchDeg },
    ].sort((a, b) => a.t - b.t);
    const keyframes = simplifyPath(clampPath(raw));
    const decision = panDecision(keyframes);
    h.viewPath = decision === 'pan' ? keyframes : [{ t: h.start, yawDeg: view.yawDeg, pitchDeg: view.pitchDeg }];
    h.panProxy = decision === 'pan' ? 'pending' : undefined;
    h.planetProxy = h.planetProxy ?? 'pending';
    done += 1;
    onProgress?.(done / Math.max(1, todo.length));
    log.info('view path', { item: item.name, window: h.index, decision, sweep: Math.round(pathSweepDeg(keyframes)), keyframes: keyframes.map((k) => `${k.t}s:${k.yawDeg}`).join(' → ') });
  }

  // Windows already carrying a path still need planet clips.
  for (const h of record.highlights) if (h.view && h.planetProxy === undefined) h.planetProxy = 'pending';
  return done;
}

/** True when the window has any render still to do (used by the planner). */
export function windowNeedsRender(h: HighlightWindow): boolean {
  return (h.view !== undefined && h.proxy !== 'ready') || h.panProxy === 'pending' || h.planetProxy === 'pending';
}
