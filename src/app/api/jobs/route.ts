import { badRequest, handle, json, readJsonBody } from '@/server/http';
import { ensureBootstrapped } from '@/server/library/service';
import { cancel, pause, resume, snapshot } from '@/server/jobs/queue';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Queue status for the progress UI (poll every 1–2 s). */
export const GET = handle(async () => {
  await ensureBootstrapped();
  return json(snapshot());
});

/** Control the queue. Body: { action: 'pause' | 'resume' | 'cancel', jobId?: string } */
export const POST = handle(async (req: Request) => {
  await ensureBootstrapped();
  const body = await readJsonBody(req);
  const action = body.action;

  switch (action) {
    case 'pause':
      pause();
      break;
    case 'resume':
      resume();
      break;
    case 'cancel': {
      const jobId = body.jobId;
      if (typeof jobId !== 'string' || !jobId) throw badRequest('"jobId" is required to cancel');
      if (!cancel(jobId)) throw badRequest('No such queued or running job');
      break;
    }
    default:
      throw badRequest('"action" must be pause, resume or cancel');
  }
  return json(snapshot());
});
