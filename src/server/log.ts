/**
 * Minimal structured logger for the local server.
 *
 * - One line per event, prefixed with a scope, easy to grep in the terminal.
 * - Redacts anything that looks like a secret before it reaches stdout so a
 *   future API-key setting can never leak through a careless log call.
 * - Debug output is opt-in via PHOTOFORGE_DEBUG=1.
 */

import { assertServer } from './runtime';

assertServer();

type Level = 'debug' | 'info' | 'warn' | 'error';

const SECRET_KEY_PATTERN = /(api[_-]?key|token|secret|authorization|password)/i;

function redact(value: unknown): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value === 'string') {
    return value.length > 24 && /^[A-Za-z0-9_\-]+$/.test(value) ? `${value.slice(0, 4)}…[redacted]` : value;
  }
  if (Array.isArray(value)) return value.map(redact);
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = SECRET_KEY_PATTERN.test(k) ? '[redacted]' : redact(v);
    }
    return out;
  }
  return value;
}

function emit(level: Level, scope: string, message: string, data?: unknown): void {
  if (level === 'debug' && process.env.PHOTOFORGE_DEBUG !== '1') return;
  const line = `[PhotoForge:${scope}] ${message}`;
  const payload = data === undefined ? undefined : redact(data);
  const fn = level === 'error' ? console.error : level === 'warn' ? console.warn : console.log;
  if (payload === undefined) fn(line);
  else fn(line, typeof payload === 'string' ? payload : JSON.stringify(payload));
}

export interface Logger {
  debug(message: string, data?: unknown): void;
  info(message: string, data?: unknown): void;
  warn(message: string, data?: unknown): void;
  error(message: string, data?: unknown): void;
}

export function createLogger(scope: string): Logger {
  return {
    debug: (m, d) => emit('debug', scope, m, d),
    info: (m, d) => emit('info', scope, m, d),
    warn: (m, d) => emit('warn', scope, m, d),
    error: (m, d) => emit('error', scope, m, d),
  };
}

/** Normalise unknown thrown values into a short message safe for API responses. */
export function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === 'string') return err;
  return 'Unknown error';
}
