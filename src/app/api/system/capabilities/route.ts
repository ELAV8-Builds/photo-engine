import { handle, json } from '@/server/http';
import { findTool } from '@/server/media/binaries';
import { ffmpegVersion, hasVideoToolbox } from '@/server/media/ffmpeg';
import { appDataDir } from '@/server/runtime';
import type { SystemCapabilities } from '@/types/library';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** What this machine can do, so the UI can explain missing pieces instead of failing later. */
export const GET = handle(async () => {
  const ffmpeg = findTool('ffmpeg');
  const ffprobe = findTool('ffprobe');
  const [version, videotoolbox] = await Promise.all([ffmpegVersion(), hasVideoToolbox()]);

  const caps: SystemCapabilities = {
    platform: process.platform,
    appDataDir: appDataDir(),
    ffmpeg: { found: !!ffmpeg, path: ffmpeg ?? undefined, version: version ?? undefined, videotoolbox },
    ffprobe: { found: !!ffprobe, path: ffprobe ?? undefined },
    sips: !!findTool('sips'),
    exiftool: !!findTool('exiftool'),
    nativeFolderPicker: process.platform === 'darwin' && !!findTool('osascript'),
  };
  return json(caps);
});
