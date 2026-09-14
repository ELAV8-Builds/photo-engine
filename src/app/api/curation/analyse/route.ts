import { badRequest, handle, json, readJsonBody } from '@/server/http';
import { analyseItems } from '@/server/library/service';
import { readProviderChoice } from '@/server/ai';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ITEM_ID_RE = /^[a-f0-9]{20}$/;

/**
 * Queue model curation. Body: { itemIds?: string[], force?: boolean }.
 * Headers X-PhotoForge-Provider / X-PhotoForge-Gemini-Key pick the backend
 * (default local). Without itemIds every item lacking a record is queued.
 * 503 when the local model server or model is unavailable.
 */
export const POST = handle(async (req: Request) => {
  const provider = readProviderChoice(req);
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
  return json(await analyseItems({ itemIds, force, provider }));
});
