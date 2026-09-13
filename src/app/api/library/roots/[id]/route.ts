import { handle, json, notFound } from '@/server/http';
import { unregisterRoot } from '@/server/library/service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Forget a library folder (never deletes files). */
export const DELETE = handle(async (_req: Request, { params }: { params: { id: string } }) => {
  const removed = await unregisterRoot(params.id);
  if (!removed) throw notFound('Library folder not found');
  return json({ removed: true });
});
