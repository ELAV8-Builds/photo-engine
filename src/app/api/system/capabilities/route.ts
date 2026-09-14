import { handle, json } from '@/server/http';
import { findTool } from '@/server/media/binaries';
import { ffmpegVersion, hasVideoToolbox } from '@/server/media/ffmpeg';
import { hasModel, ollamaHealth } from '@/server/ai/ollama';
import { getSettings } from '@/server/settings/store';
import { detectPhotosLibrary } from '@/server/photos/library';
import { describeCloudSession } from '@/server/ai/session';
import { getRoots } from '@/server/library/service';
import { appDataDir } from '@/server/runtime';
import type { PhotosLibraryInfo, SystemCapabilities } from '@/types/library';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** What this machine can do, so the UI can explain missing pieces instead of failing later. */
export const GET = handle(async () => {
  const ffmpeg = findTool('ffmpeg');
  const ffprobe = findTool('ffprobe');
  const [version, videotoolbox, ollama, settings, photosLib, roots] = await Promise.all([
    ffmpegVersion(),
    hasVideoToolbox(),
    ollamaHealth(),
    getSettings(),
    detectPhotosLibrary(),
    getRoots(),
  ]);

  const photosLibrary: PhotosLibraryInfo = photosLib
    ? {
        found: true,
        label: photosLib.label,
        readable: photosLib.readable,
        registeredRootId: roots.find((r) => r.path === photosLib.originalsPath)?.id,
      }
    : { found: false, readable: false };

  const caps: SystemCapabilities = {
    platform: process.platform,
    appDataDir: appDataDir(),
    ffmpeg: { found: !!ffmpeg, path: ffmpeg ?? undefined, version: version ?? undefined, videotoolbox },
    ffprobe: { found: !!ffprobe, path: ffprobe ?? undefined },
    sips: !!findTool('sips'),
    exiftool: !!findTool('exiftool'),
    nativeFolderPicker: process.platform === 'darwin' && !!findTool('osascript'),
    ollama: {
      running: ollama.running,
      version: ollama.version,
      models: ollama.models,
      model: settings.visionModel,
      modelAvailable: ollama.running && hasModel(ollama.models, settings.visionModel),
    },
    photosLibrary,
    cloudSession: describeCloudSession(),
  };
  return json(caps);
});
