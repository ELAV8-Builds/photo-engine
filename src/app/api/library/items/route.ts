import { badRequest, handle, json } from '@/server/http';
import { listItems } from '@/server/library/service';
import type { MediaKind } from '@/types/library';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function optionalInt(value: string | null, name: string): number | undefined {
  if (value === null || value === '') return undefined;
  const n = Number(value);
  if (!Number.isInteger(n) || n < 0) throw badRequest(`"${name}" must be a non-negative integer`);
  return n;
}

/** Page through indexed items, oldest capture first. ?rootId=&kind=photo|video&offset=&limit= */
export const GET = handle(async (req: Request) => {
  const url = new URL(req.url);
  const kindRaw = url.searchParams.get('kind');
  if (kindRaw !== null && kindRaw !== 'photo' && kindRaw !== 'video') throw badRequest('"kind" must be photo or video');

  const page = await listItems({
    rootId: url.searchParams.get('rootId') ?? undefined,
    kind: (kindRaw as MediaKind | null) ?? undefined,
    offset: optionalInt(url.searchParams.get('offset'), 'offset'),
    limit: optionalInt(url.searchParams.get('limit'), 'limit'),
  });
  return json(page);
});
