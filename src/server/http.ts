/**
 * HTTP helpers for API route handlers: consistent JSON envelopes, error
 * mapping, and Range-aware file streaming for <video> seeking.
 */

import fs from 'fs';
import fsp from 'fs/promises';
import path from 'path';
import { Readable } from 'stream';
import { NextResponse } from 'next/server';
import { assertServer } from './runtime';
import { createLogger, errorMessage } from './log';
import { PathEscapeError } from './fs/safe-path';
import { ProcessError } from './media/ffmpeg';

assertServer();

const log = createLogger('http');

export function json<T>(data: T, init?: ResponseInit): NextResponse {
  return NextResponse.json(data, init);
}

export function fail(status: number, message: string): NextResponse {
  return NextResponse.json({ error: message }, { status });
}

export class HttpError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
    this.name = 'HttpError';
  }
}

export const notFound = (what = 'Not found') => new HttpError(404, what);
export const badRequest = (what: string) => new HttpError(400, what);

/**
 * Wrap a handler so thrown errors become well-formed JSON responses and are
 * logged once. Keeps route files free of try/catch boilerplate.
 */
export function handle<Args extends unknown[]>(fn: (...args: Args) => Promise<Response>): (...args: Args) => Promise<Response> {
  return async (...args: Args) => {
    try {
      return await fn(...args);
    } catch (err) {
      if (err instanceof HttpError) return fail(err.status, err.message);
      if (err instanceof PathEscapeError) return fail(403, err.message);
      if (err instanceof ProcessError) {
        log.error('tool failure', { message: err.message });
        return fail(500, err.message);
      }
      const message = errorMessage(err);
      log.error('unhandled', { message });
      return fail(500, message);
    }
  };
}

/** Parse a JSON body, rejecting anything that is not a plain object. */
export async function readJsonBody(req: Request): Promise<Record<string, unknown>> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    throw badRequest('Body must be JSON');
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw badRequest('Body must be a JSON object');
  return body as Record<string, unknown>;
}

export function requireString(obj: Record<string, unknown>, key: string, maxLen = 4096): string {
  const v = obj[key];
  if (typeof v !== 'string' || !v.trim()) throw badRequest(`"${key}" is required`);
  if (v.length > maxLen) throw badRequest(`"${key}" is too long`);
  return v;
}

// ---------------------------------------------------------------------------
// File streaming
// ---------------------------------------------------------------------------

const CONTENT_TYPES: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  heic: 'image/heic',
  heif: 'image/heif',
  tif: 'image/tiff',
  tiff: 'image/tiff',
  insp: 'image/jpeg',
  mp4: 'video/mp4',
  m4v: 'video/x-m4v',
  mov: 'video/quicktime',
  webm: 'video/webm',
  mkv: 'video/x-matroska',
  insv: 'video/mp4',
  lrv: 'video/mp4',
};

export function contentTypeFor(filePath: string): string {
  const ext = path.extname(filePath).slice(1).toLowerCase();
  return CONTENT_TYPES[ext] ?? 'application/octet-stream';
}

/** Cache policy for artefacts addressed by a content-versioned id. */
export const IMMUTABLE_PRIVATE = 'private, max-age=31536000, immutable';

export interface ServeFileOptions {
  contentType?: string;
  cacheControl?: string;
  /** Suggested filename for downloads (adds Content-Disposition: inline). */
  filename?: string;
}

function parseRange(header: string | null, size: number): { start: number; end: number } | null | 'invalid' {
  if (!header) return null;
  const m = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!m) return 'invalid';
  const [, startRaw, endRaw] = m;
  if (startRaw === '' && endRaw === '') return 'invalid';
  let start: number;
  let end: number;
  if (startRaw === '') {
    // suffix range: last N bytes
    const suffix = Number(endRaw);
    if (suffix <= 0) return 'invalid';
    start = Math.max(0, size - suffix);
    end = size - 1;
  } else {
    start = Number(startRaw);
    end = endRaw === '' ? size - 1 : Math.min(Number(endRaw), size - 1);
  }
  if (!Number.isFinite(start) || !Number.isFinite(end) || start > end || start >= size) return 'invalid';
  return { start, end };
}

/**
 * Stream a file with HTTP Range support (206), ETag and Last-Modified.
 * Used for originals, renditions, proxies and thumbnails alike.
 */
export async function serveFile(req: Request, absPath: string, opts: ServeFileOptions = {}): Promise<Response> {
  let stat: fs.Stats;
  try {
    stat = await fsp.stat(absPath);
  } catch {
    throw notFound('File not found');
  }
  if (!stat.isFile()) throw notFound('File not found');

  const size = stat.size;
  const etag = `"${size.toString(16)}-${Math.floor(stat.mtimeMs).toString(16)}"`;
  const headers = new Headers({
    'Content-Type': opts.contentType ?? contentTypeFor(absPath),
    'Accept-Ranges': 'bytes',
    'Cache-Control': opts.cacheControl ?? 'private, no-cache',
    ETag: etag,
    'Last-Modified': stat.mtime.toUTCString(),
    'X-Content-Type-Options': 'nosniff',
  });
  if (opts.filename) headers.set('Content-Disposition', `inline; filename="${encodeURIComponent(opts.filename)}"`);

  if (req.headers.get('if-none-match') === etag) {
    return new Response(null, { status: 304, headers });
  }

  const range = parseRange(req.headers.get('range'), size);
  if (range === 'invalid') {
    headers.set('Content-Range', `bytes */${size}`);
    return new Response(null, { status: 416, headers });
  }

  const start = range?.start ?? 0;
  const end = range?.end ?? size - 1;
  headers.set('Content-Length', String(end - start + 1));
  if (range) headers.set('Content-Range', `bytes ${start}-${end}/${size}`);

  if (req.method === 'HEAD') return new Response(null, { status: range ? 206 : 200, headers });

  const nodeStream = fs.createReadStream(absPath, { start, end });
  const body = Readable.toWeb(nodeStream) as unknown as ReadableStream<Uint8Array>;
  return new Response(body, { status: range ? 206 : 200, headers });
}
