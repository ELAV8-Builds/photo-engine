import { badRequest, handle, json, notFound, readJsonBody } from '@/server/http';
import { setHighlightView } from '@/server/library/service';
import { PAN_PITCH_LIMIT_DEG, PAN_YAW_LIMIT_DEG } from '@/server/media/pan';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function angle(v: unknown, limit: number, name: string): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) throw badRequest(`"${name}" must be a number`);
  return Math.max(-limit, Math.min(limit, Math.round(v)));
}

/**
 * Phase 5: set a highlight's view by hand. Body: { lens: 'a'|'b', yawDeg, pitchDeg,
 * keepPan?, planetRotationDeg? }. The window's rendered clips are discarded and
 * re-rendered with the new view; the view is marked `source: 'user'` so
 * re-curation never overrides it. Phase 7: keepPan: true shifts the window's
 * existing pan path by the same delta instead of collapsing it to a static view,
 * and planetRotationDeg (±180°, snapped to 15°) spins the tiny-planet render.
 */
export const PUT = handle(async (req: Request, { params }: { params: { id: string; n: string } }) => {
  if (!/^\d{1,2}$/.test(params.n)) throw badRequest('Highlight index must be a small integer');
  const body = await readJsonBody(req);
  const lens: 'a' | 'b' | undefined = body.lens === 'a' ? 'a' : body.lens === 'b' ? 'b' : undefined;
  if (!lens) throw badRequest('"lens" must be a or b');
  if (body.keepPan !== undefined && typeof body.keepPan !== 'boolean') throw badRequest('"keepPan" must be a boolean');
  let planetRotationDeg: number | undefined;
  if (body.planetRotationDeg !== undefined) {
    if (typeof body.planetRotationDeg !== 'number' || !Number.isFinite(body.planetRotationDeg)) throw badRequest('"planetRotationDeg" must be a number');
    planetRotationDeg = Math.max(-180, Math.min(180, Math.round(body.planetRotationDeg / 15) * 15));
  }
  const view = { lens, yawDeg: angle(body.yawDeg, PAN_YAW_LIMIT_DEG, 'yawDeg'), pitchDeg: angle(body.pitchDeg, PAN_PITCH_LIMIT_DEG, 'pitchDeg') };
  const result = await setHighlightView(params.id, Number(params.n), view, { keepPan: body.keepPan === true, planetRotationDeg });
  if (!result) throw notFound('No such 360 highlight');
  return json(result);
});
