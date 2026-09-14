/**
 * Provider factory + request-header parsing.
 *
 * The browser states its choice per request with two headers:
 *   X-PhotoForge-Provider:   local | gemini
 *   X-PhotoForge-Gemini-Key: <key>            (gemini only)
 *   X-PhotoForge-Gemini-Model: <model id>     (optional)
 * Nothing about the choice is stored in settings.json; a gemini choice parks
 * the key in the in-memory cloud session so background jobs can use it.
 */

import { assertServer } from '../runtime';
import { badRequest } from '../http';
import { createOllamaProvider } from './ollama';
import { DEFAULT_GEMINI_MODEL, GeminiProvider, isGeminiModelId, isPlausibleGeminiKey } from './gemini';
import { getCloudSession, setCloudSession } from './session';
import { ProviderUnavailableError, type ProviderChoice, type VisionProvider } from './provider';
import type { ProviderKind } from '@/types/library';

assertServer();

export const PROVIDER_HEADER = 'x-photoforge-provider';
export const GEMINI_KEY_HEADER = 'x-photoforge-gemini-key';
export const GEMINI_MODEL_HEADER = 'x-photoforge-gemini-model';

/** Parse and validate the provider headers. Defaults to local. Parks a gemini key in the cloud session. */
export function readProviderChoice(req: Request): ProviderChoice {
  const kind = (req.headers.get(PROVIDER_HEADER) ?? 'local').toLowerCase();
  if (kind === 'local') return { kind: 'local' };
  if (kind !== 'gemini') throw badRequest(`Unknown provider "${kind}"`);

  const key = req.headers.get(GEMINI_KEY_HEADER);
  if (!isPlausibleGeminiKey(key)) throw badRequest('A Gemini API key is required when the provider is gemini');
  const modelRaw = req.headers.get(GEMINI_MODEL_HEADER);
  const model = modelRaw ? (isGeminiModelId(modelRaw) ? modelRaw : undefined) : undefined;
  if (modelRaw && !model) throw badRequest('Invalid Gemini model id');

  setCloudSession('gemini', key, model);
  return { kind: 'gemini', key, model };
}

/** Provider for a concrete choice (key in hand). `threads` bounds local model CPU (Phase 7, §3.1). */
export function createProvider(choice: ProviderChoice, localModel: string, threads?: number): VisionProvider {
  if (choice.kind === 'gemini') return new GeminiProvider({ key: choice.key, model: choice.model ?? DEFAULT_GEMINI_MODEL });
  return createOllamaProvider(localModel, threads);
}

/**
 * Provider for a background job that only knows the provider *kind*: gemini
 * jobs pull the key from the cloud session; when it has expired the job must
 * stay pending rather than fail. `threads` bounds local model CPU (Phase 7).
 */
export function createProviderForKind(kind: ProviderKind | undefined, localModel: string, threads?: number): VisionProvider {
  if (kind === 'gemini') {
    const session = getCloudSession();
    if (!session) throw new ProviderUnavailableError('Cloud session expired — open Settings to reconnect Gemini, then Analyse again');
    return new GeminiProvider({ key: session.key, model: session.model ?? DEFAULT_GEMINI_MODEL });
  }
  return createOllamaProvider(localModel, threads);
}
