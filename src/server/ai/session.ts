/**
 * Cloud session — the one place a cloud API key exists on the server, and it
 * is process memory only. Background jobs (curate) run long after the HTTP
 * request that started them, so the key from the request is parked here with
 * a sliding expiry and looked up by the job at run time. A restart forgets it.
 *
 * Single-user, localhost-only app → one slot is enough; a nonce would add
 * ceremony without adding protection against anything this app faces.
 */

import { assertServer, globalSingleton } from '../runtime';
import { createLogger } from '../log';
import type { ProviderKind } from '@/types/library';

assertServer();

const log = createLogger('session');

/** How long a parked key stays valid after its last use. */
export const CLOUD_SESSION_TTL_MS = 60 * 60_000;

interface CloudSession {
  kind: Exclude<ProviderKind, 'local'>;
  key: string;
  model?: string;
  expiresAt: number;
}

const state = globalSingleton<{ current: CloudSession | null }>('__photoforge_cloud_session', () => ({ current: null }));

export function setCloudSession(kind: CloudSession['kind'], key: string, model?: string): void {
  const fresh = !state.current || state.current.key !== key;
  state.current = { kind, key, model, expiresAt: Date.now() + CLOUD_SESSION_TTL_MS };
  if (fresh) log.info('cloud session opened', { kind, model, ttlMin: CLOUD_SESSION_TTL_MS / 60_000 });
}

/** Returns the live session and slides its expiry; null when absent or expired. */
export function getCloudSession(): CloudSession | null {
  const s = state.current;
  if (!s) return null;
  if (s.expiresAt < Date.now()) {
    state.current = null;
    log.info('cloud session expired');
    return null;
  }
  s.expiresAt = Date.now() + CLOUD_SESSION_TTL_MS;
  return s;
}

export function clearCloudSession(): boolean {
  const had = !!state.current;
  state.current = null;
  if (had) log.info('cloud session cleared');
  return had;
}

/** Safe-to-serialise view for /api/system/capabilities (never includes the key). */
export function describeCloudSession(): { active: boolean; kind?: ProviderKind; model?: string; expiresAt?: number } {
  const s = state.current && state.current.expiresAt >= Date.now() ? state.current : null;
  return s ? { active: true, kind: s.kind, model: s.model, expiresAt: s.expiresAt } : { active: false };
}
