/**
 * AI provider choice — browser-owned. The Gemini key lives in IndexedDB
 * (`settings` store, key `aiProvider`) and is forwarded per request as
 * headers; the server keeps it in memory only, never on disk.
 */

import { getSetting, setSetting } from './db';
import type { ProviderKind } from '@/types/library';

export interface AiProviderSettings {
  provider: ProviderKind;
  geminiKey: string;
  geminiModel: string;
}

export const DEFAULT_GEMINI_MODEL = 'gemini-3.5-flash-lite';
const SETTING_KEY = 'aiProvider';

export const DEFAULT_PROVIDER_SETTINGS: AiProviderSettings = { provider: 'local', geminiKey: '', geminiModel: DEFAULT_GEMINI_MODEL };

/** In-memory copy so request helpers stay synchronous. */
let current: AiProviderSettings = DEFAULT_PROVIDER_SETTINGS;
let loaded: Promise<AiProviderSettings> | null = null;

function sanitize(raw: Partial<AiProviderSettings> | undefined): AiProviderSettings {
  return {
    provider: raw?.provider === 'gemini' ? 'gemini' : 'local',
    geminiKey: typeof raw?.geminiKey === 'string' ? raw.geminiKey.trim() : '',
    geminiModel: typeof raw?.geminiModel === 'string' && /^[a-z0-9][a-z0-9.\-]{2,60}$/.test(raw.geminiModel) ? raw.geminiModel : DEFAULT_GEMINI_MODEL,
  };
}

export function loadProviderSettings(): Promise<AiProviderSettings> {
  if (!loaded) {
    loaded = getSetting<Partial<AiProviderSettings> | undefined>(SETTING_KEY, undefined)
      .then((raw) => (current = sanitize(raw)))
      .catch(() => current);
  }
  return loaded;
}

export async function saveProviderSettings(next: AiProviderSettings): Promise<AiProviderSettings> {
  current = sanitize(next);
  loaded = Promise.resolve(current);
  await setSetting(SETTING_KEY, current);
  return current;
}

export function currentProviderSettings(): AiProviderSettings {
  return current;
}

/** True when model work would leave this Mac. */
export function cloudProviderActive(s: AiProviderSettings = current): boolean {
  return s.provider === 'gemini' && s.geminiKey.length > 0;
}

/** Headers the model routes read. Local = no headers at all. */
export function providerHeaders(s: AiProviderSettings = current): Record<string, string> {
  if (!cloudProviderActive(s)) return {};
  return {
    'X-PhotoForge-Provider': 'gemini',
    'X-PhotoForge-Gemini-Key': s.geminiKey,
    'X-PhotoForge-Gemini-Model': s.geminiModel,
  };
}
