import { badRequest, handle, json, readJsonBody } from '@/server/http';
import { clearOrphanedArtifacts, storageReport } from '@/server/library/service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Phase 6: cache sizes per artefact class and what is orphaned. */
export const GET = handle(async () => json(await storageReport()));

/** Body: { action: 'clear-orphans' } → removes every orphaned artefact and returns the fresh report. */
export const POST = handle(async (req: Request) => {
  const body = await readJsonBody(req);
  if (body.action !== 'clear-orphans') throw badRequest('"action" must be clear-orphans');
  return json(await clearOrphanedArtifacts());
});
