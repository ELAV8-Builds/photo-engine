import { badRequest, handle, json, readJsonBody } from '@/server/http';
import { planStory } from '@/server/library/service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const KEY_RE = /^[a-f0-9]{20}(#\d{1,2})?$/;

/**
 * Story plan for the current shot list.
 * Body: { keys?: string[] (itemId | itemId#highlightIndex, project order), force?: boolean }
 * Model-written when Ollama is available, otherwise heuristic — always 200 with `plan.source`.
 */
export const POST = handle(async (req: Request) => {
  const body = await readJsonBody(req);
  let keys: string[] | undefined;
  if (body.keys !== undefined) {
    if (!Array.isArray(body.keys) || body.keys.length > 2000 || !body.keys.every((k) => typeof k === 'string' && KEY_RE.test(k))) {
      throw badRequest('"keys" must be an array of item ids or itemId#index keys');
    }
    keys = body.keys as string[];
  }
  const force = body.force === undefined ? false : body.force;
  if (typeof force !== 'boolean') throw badRequest('"force" must be a boolean');
  return json(await planStory({ keys, force }));
});
