import { handle, IMMUTABLE_PRIVATE, notFound, serveFile } from '@/server/http';
import { resolveItem } from '@/server/library/service';
import { thumbPath } from '@/server/media/thumbnails';
import { fileExists } from '@/server/runtime';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Grid thumbnail (≤512px JPEG). 404 until the prepare job has produced it. */
export const GET = handle(async (req: Request, { params }: { params: { id: string } }) => {
  const item = await resolveItem(params.id);
  if (!item) throw notFound('Item not found');
  const p = thumbPath(item.id);
  if (!(await fileExists(p))) throw notFound('Thumbnail not ready');
  return serveFile(req, p, { contentType: 'image/jpeg', cacheControl: IMMUTABLE_PRIVATE });
});
