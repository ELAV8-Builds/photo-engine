import { fail, handle, json } from '@/server/http';
import { getRoots, registerRoot } from '@/server/library/service';
import { detectPhotosLibrary, PHOTOS_PERMISSION_HELP } from '@/server/photos/library';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Register this Mac's Photos library (its originals folder) as a library root.
 * The path is discovered server-side; the browser never supplies or sees it.
 * 404 when no library exists, 403 with guidance when macOS blocks access.
 */
export const POST = handle(async () => {
  const lib = await detectPhotosLibrary();
  if (!lib) return fail(404, 'No Photos library was found in your Pictures folder');
  if (!lib.readable) return fail(403, PHOTOS_PERMISSION_HELP);

  const existing = (await getRoots()).find((r) => r.path === lib.originalsPath);
  if (existing) return json({ root: existing, created: false });

  const { root, created } = await registerRoot(lib.originalsPath, lib.label);
  return json({ root, created }, { status: created ? 201 : 200 });
});
