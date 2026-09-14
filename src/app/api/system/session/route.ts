import { handle, json } from '@/server/http';
import { clearCloudSession, describeCloudSession } from '@/server/ai/session';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Whether a cloud key is parked in server memory (never the key itself). */
export const GET = handle(async () => json(describeCloudSession()));

/** Forget the parked cloud key immediately (Settings → switch back to local / clear key). */
export const DELETE = handle(async () => json({ cleared: clearCloudSession() }));
