import { badRequest, handle, IMMUTABLE_PRIVATE, notFound, serveFile } from '@/server/http';
import { resolveItem } from '@/server/library/service';
import { ensureRendition, parseRenditionSize } from '@/server/media/thumbnails';
import { budgetFor, getSettings } from '@/server/settings/store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Photo pixels for the renderer, capped at ?max=1024|2048|4096 (default 2048)
 * on the long edge. HEIC is converted to JPEG. Renditions are produced on
 * first request and cached; small JPEGs are served as-is.
 */
export const GET = handle(async (req: Request, { params }: { params: { id: string } }) => {
  const item = await resolveItem(params.id);
  if (!item) throw notFound('Item not found');
  if (item.kind !== 'photo') throw badRequest('Not a photo; use /stream for video');

  const max = parseRenditionSize(new URL(req.url).searchParams.get('max'));
  const budget = budgetFor((await getSettings()).performanceProfile);
  const p = await ensureRendition(item, max, { nice: budget.nice, threads: budget.threads });
  return serveFile(req, p, { contentType: 'image/jpeg', cacheControl: IMMUTABLE_PRIVATE, filename: item.name });
});
