import { badRequest, handle, json, readJsonBody } from '@/server/http';
import { getSettings, isModelTag, isPerformanceProfile, updateSettings } from '@/server/settings/store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = handle(async () => json(await getSettings()));

/** Body: { performanceProfile?: 'quiet' | 'balanced' | 'fast', visionModel?: string } */
export const PUT = handle(async (req: Request) => {
  const body = await readJsonBody(req);
  const patch: Parameters<typeof updateSettings>[0] = {};
  if ('performanceProfile' in body) {
    if (!isPerformanceProfile(body.performanceProfile)) throw badRequest('"performanceProfile" must be quiet, balanced or fast');
    patch.performanceProfile = body.performanceProfile;
  }
  if ('visionModel' in body) {
    if (!isModelTag(body.visionModel)) throw badRequest('"visionModel" must be an Ollama model tag like qwen3.5:9b');
    patch.visionModel = body.visionModel;
  }
  return json(await updateSettings(patch));
});
