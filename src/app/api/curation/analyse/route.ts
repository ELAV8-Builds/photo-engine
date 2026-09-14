import { badRequest, handle, json, readJsonBody } from '@/server/http';
import { analyseItems } from '@/server/library/service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ITEM_ID_RE = /^[a-f0-9]{20}$/;

/**
 * Queue local-model curation. Body: { itemIds?: string[], force?: boolean }.
 * Without itemIds every item lacking a record is queued. 503 when Ollama or
 * the configured model is unavailable.
 */
export const POST = handle(async (req: Request) => {
  const body = await readJsonBody(req);
  let itemIds: string[] | undefined;
  if (body.itemIds !== undefined) {
    if (!Array.isArray(body.itemIds) || body.itemIds.length > 5000 || !body.itemIds.every((id) => typeof id === 'string' && ITEM_ID_RE.test(id))) {
      throw badRequest('"itemIds" must be an array of item ids');
    }
    itemIds = body.itemIds as string[];
  }
  const force = body.force === undefined ? false : body.force;
  if (typeof force !== 'boolean') throw badRequest('"force" must be a boolean');
  return json(await analyseItems({ itemIds, force }));
});
