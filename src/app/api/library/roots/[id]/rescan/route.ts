import { handle, json, notFound } from '@/server/http';
import { rescanRoot } from '@/server/library/service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Re-walk a folder to pick up new, changed or removed files. */
export const POST = handle(async (_req: Request, { params }: { params: { id: string } }) => {
  const ok = await rescanRoot(params.id);
  if (!ok) throw notFound('Library folder not found');
  return json({ queued: true });
});
