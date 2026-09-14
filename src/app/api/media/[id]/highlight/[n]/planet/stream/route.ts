import { badRequest, handle, IMMUTABLE_PRIVATE, notFound, serveFile } from '@/server/http';
import { resolveItem } from '@/server/library/service';
import { highlightPlanetPath } from '@/server/curation/record';
import { fileExists } from '@/server/runtime';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Phase 5: the square tiny-planet clip for highlight n (Range support). 404 until rendered. */
async function serve(req: Request, id: string, nRaw: string): Promise<Response> {
  if (!/^\d{1,2}$/.test(nRaw)) throw badRequest('Highlight index must be a small integer');
  const item = await resolveItem(id);
  if (!item) throw notFound('Item not found');
  const p = highlightPlanetPath(item.id, Number(nRaw));
  if (!(await fileExists(p))) throw notFound('Tiny-planet clip not ready');
  return serveFile(req, p, { contentType: 'video/mp4', cacheControl: IMMUTABLE_PRIVATE });
}

export const GET = handle(async (req: Request, { params }: { params: { id: string; n: string } }) => serve(req, params.id, params.n));
export const HEAD = handle(async (req: Request, { params }: { params: { id: string; n: string } }) => serve(req, params.id, params.n));
