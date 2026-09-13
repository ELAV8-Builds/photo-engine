import { handle, json, readJsonBody, requireString } from '@/server/http';
import { getRoots, registerRoot } from '@/server/library/service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** List registered library folders. */
export const GET = handle(async () => {
  return json({ roots: await getRoots() });
});

/** Register a folder the user picked. Body: { path: string } */
export const POST = handle(async (req: Request) => {
  const body = await readJsonBody(req);
  const inputPath = requireString(body, 'path');
  const { root, created } = await registerRoot(inputPath);
  return json({ root, created }, { status: created ? 201 : 200 });
});
