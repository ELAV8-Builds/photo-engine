import { handle, json, notFound } from '@/server/http';
import { getItemDto } from '@/server/library/service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** One item's current metadata and processing status. */
export const GET = handle(async (_req: Request, { params }: { params: { id: string } }) => {
  const item = await getItemDto(params.id);
  if (!item) throw notFound('Item not found');
  return json({ item });
});
