import { badRequest, handle, json, readJsonBody } from '@/server/http';
import { planMontage } from '@/server/library/service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Plan a montage from curated items.
 * Body: { slots: number (1–200), videoRatio?: 0–1, chronological?: boolean, exclude?: string[] }
 * `exclude` holds item ids and "itemId#highlightIndex" keys already in the project.
 */
export const POST = handle(async (req: Request) => {
  const body = await readJsonBody(req);
  const slots = body.slots;
  if (typeof slots !== 'number' || !Number.isInteger(slots) || slots < 1 || slots > 200) throw badRequest('"slots" must be an integer from 1 to 200');

  let videoRatio: number | undefined;
  if (body.videoRatio !== undefined) {
    if (typeof body.videoRatio !== 'number' || body.videoRatio < 0 || body.videoRatio > 1) throw badRequest('"videoRatio" must be between 0 and 1');
    videoRatio = body.videoRatio;
  }
  let chronological: boolean | undefined;
  if (body.chronological !== undefined) {
    if (typeof body.chronological !== 'boolean') throw badRequest('"chronological" must be a boolean');
    chronological = body.chronological;
  }
  let exclude: Set<string> | undefined;
  if (body.exclude !== undefined) {
    if (!Array.isArray(body.exclude) || body.exclude.length > 5000 || !body.exclude.every((k) => typeof k === 'string' && /^[a-f0-9]{20}(#\d{1,2})?$/.test(k))) {
      throw badRequest('"exclude" must be an array of item ids or itemId#index keys');
    }
    exclude = new Set(body.exclude as string[]);
  }

  return json(await planMontage({ slots, videoRatio, chronological, exclude }));
});
