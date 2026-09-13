import { badRequest, handle, IMMUTABLE_PRIVATE, notFound, serveFile } from '@/server/http';
import { resolveItem } from '@/server/library/service';
import { proxyPath } from '@/server/media/thumbnails';
import { fileExists } from '@/server/runtime';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Video bytes with Range support so <video> can seek.
 *   ?variant=original (default) — the file as it is on disk
 *   ?variant=proxy               — the flat 720p preview for 360 clips (404 until ready)
 */
async function serve(req: Request, id: string): Promise<Response> {
  const item = await resolveItem(id);
  if (!item) throw notFound('Item not found');
  if (item.kind !== 'video') throw badRequest('Not a video; use /image for photos');

  const variant = new URL(req.url).searchParams.get('variant') ?? 'original';
  if (variant === 'proxy') {
    const p = proxyPath(item.id);
    if (!(await fileExists(p))) throw notFound('Preview not ready');
    return serveFile(req, p, { contentType: 'video/mp4', cacheControl: IMMUTABLE_PRIVATE });
  }
  if (variant !== 'original') throw badRequest('"variant" must be original or proxy');

  return serveFile(req, item.absPath, { cacheControl: IMMUTABLE_PRIVATE, filename: item.name });
}

export const GET = handle(async (req: Request, { params }: { params: { id: string } }) => serve(req, params.id));
export const HEAD = handle(async (req: Request, { params }: { params: { id: string } }) => serve(req, params.id));
