import { badRequest, handle, IMMUTABLE_PRIVATE, notFound, serveFile } from '@/server/http';
import { resolveItem } from '@/server/library/service';
import { HIGHLIGHT_FRAME_MARGIN_SEC, loadCuration, viewFramePath } from '@/server/curation/record';
import { ensureViewFrame } from '@/server/media/thumbnails';
import { budgetFor, getSettings } from '@/server/settings/store';
import { PAN_PITCH_LIMIT_DEG, PAN_YAW_LIMIT_DEG } from '@/server/media/pan';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function angle(raw: string | null, limit: number, name: string): number {
  if (raw === null || raw === '') return 0;
  const n = Number(raw);
  if (!Number.isFinite(n)) throw badRequest(`"${name}" must be a number`);
  return Math.max(-limit, Math.min(limit, Math.round(n)));
}

/**
 * Phase 5 yaw editor preview: one 640×360 flat frame of highlight n, for
 * ?lens=a|b&yaw=&pitch= (whole degrees, clamped). Phase 7 adds ?t= (seconds,
 * 0.1 s resolution) so the pan strip can show the window's start and end; it
 * must land inside the window ± the render margin. Default is the window's
 * peak. Cached per (time, angle); generation shares the rendition concurrency cap.
 */
export const GET = handle(async (req: Request, { params }: { params: { id: string; n: string } }) => {
  if (!/^\d{1,2}$/.test(params.n)) throw badRequest('Highlight index must be a small integer');
  const item = await resolveItem(params.id);
  if (!item || item.kind !== 'video' || !item.is360) throw notFound('Not a 360 video');
  const record = await loadCuration(item.id);
  const h = record?.highlights.find((w) => w.index === Number(params.n));
  if (!h) throw notFound('No such highlight');

  const url = new URL(req.url);
  const lensRaw = url.searchParams.get('lens') ?? h.view?.lens ?? 'a';
  if (lensRaw !== 'a' && lensRaw !== 'b') throw badRequest('"lens" must be a or b');
  const yawDeg = angle(url.searchParams.get('yaw'), PAN_YAW_LIMIT_DEG, 'yaw');
  const pitchDeg = angle(url.searchParams.get('pitch'), PAN_PITCH_LIMIT_DEG, 'pitch');

  const tRaw = url.searchParams.get('t');
  let atSec = h.sampleT;
  if (tRaw !== null && tRaw !== '') {
    const t = Number(tRaw);
    if (!Number.isFinite(t)) throw badRequest('"t" must be a number');
    const lo = Math.max(0, h.start - HIGHLIGHT_FRAME_MARGIN_SEC);
    const hi = h.end + HIGHLIGHT_FRAME_MARGIN_SEC;
    if (t < lo || t > hi) throw badRequest(`"t" must be within this moment (${lo.toFixed(1)}–${hi.toFixed(1)} s)`);
    atSec = Math.round(t * 10) / 10;
  }

  const budget = budgetFor((await getSettings()).performanceProfile);
  const p = await ensureViewFrame(item, atSec, lensRaw, { yawDeg, pitchDeg }, viewFramePath(item.id, atSec, lensRaw, yawDeg, pitchDeg), {
    nice: budget.nice,
    threads: budget.threads,
  });
  return serveFile(req, p, { contentType: 'image/jpeg', cacheControl: IMMUTABLE_PRIVATE });
});
