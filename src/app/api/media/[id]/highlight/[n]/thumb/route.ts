import { badRequest, handle, IMMUTABLE_PRIVATE, notFound, serveFile } from '@/server/http';
import { resolveItem } from '@/server/library/service';
import { highlightProxyPath, loadCuration } from '@/server/curation/record';
import { ensureHighlightThumb } from '@/server/media/thumbnails';
import { budgetFor, getSettings } from '@/server/settings/store';
import { fileExists } from '@/server/runtime';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Middle frame of a rendered 360 highlight clip (≤512 px JPEG). 404 until the clip exists. */
export const GET = handle(async (req: Request, { params }: { params: { id: string; n: string } }) => {
  if (!/^\d{1,2}$/.test(params.n)) throw badRequest('Highlight index must be a small integer');
  const item = await resolveItem(params.id);
  if (!item) throw notFound('Item not found');
  const index = Number(params.n);
  const clip = highlightProxyPath(item.id, index);
  if (!(await fileExists(clip))) throw notFound('Highlight clip not ready');

  const record = await loadCuration(item.id);
  const h = record?.highlights.find((w) => w.index === index);
  const clipDuration = h ? h.end - h.start + 1 : 5;
  const budget = budgetFor((await getSettings()).performanceProfile);
  const p = await ensureHighlightThumb(item.id, index, clip, clipDuration, { nice: budget.nice, threads: budget.threads });
  return serveFile(req, p, { contentType: 'image/jpeg', cacheControl: IMMUTABLE_PRIVATE });
});
