import { handle, json, notFound } from '@/server/http';
import { getCurationRecord } from '@/server/library/service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Full curation record (grades, highlight windows, chosen 360 views). 404 until curated. */
export const GET = handle(async (_req: Request, { params }: { params: { id: string } }) => {
  const record = await getCurationRecord(params.id);
  if (!record) throw notFound('No curation record for this item');
  return json({ record });
});
