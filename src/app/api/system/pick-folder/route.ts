import { fail, handle, json } from '@/server/http';
import { findTool } from '@/server/media/binaries';
import { run, ProcessError } from '@/server/media/ffmpeg';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Open the native macOS folder chooser on this machine and return the chosen
 * POSIX path. The server runs on the user's own computer, so the dialog appears
 * right in front of them. Returns { cancelled: true } if they dismiss it.
 */
export const POST = handle(async () => {
  const osascript = process.platform === 'darwin' ? findTool('osascript') : null;
  if (!osascript) return fail(501, 'Native folder picker is only available on macOS');

  const script = 'POSIX path of (choose folder with prompt "Choose a photo & video library folder for PhotoForge")';
  try {
    const res = await run(osascript, ['-e', script], { timeoutMs: 10 * 60_000 });
    const chosen = res.stdout.trim().replace(/\/$/, '');
    if (!chosen) return json({ cancelled: true });
    return json({ path: chosen });
  } catch (err) {
    // osascript exits 1 with "User canceled." (-128) when the dialog is dismissed.
    if (err instanceof ProcessError && /-128|User canceled/i.test(err.stderrTail)) return json({ cancelled: true });
    throw err;
  }
});
