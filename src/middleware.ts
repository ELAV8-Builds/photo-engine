import { NextResponse, type NextRequest } from 'next/server';

/**
 * Local-only guard for the library APIs.
 *
 * These routes read files from this computer, so they must only be reachable
 * by the PhotoForge UI running in this browser:
 *   1. The Host must be a loopback address (the dev/start scripts also bind to
 *      127.0.0.1, this is defence in depth).
 *   2. Requests initiated by other websites are rejected via Sec-Fetch-Site —
 *      a page on another origin cannot pull thumbnails or trigger scans.
 *   3. State-changing methods must carry a same-origin Origin header when a
 *      browser supplies one.
 */

const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]', '::1']);

function hostnameOf(hostHeader: string | null): string {
  if (!hostHeader) return '';
  // Strip a port but keep IPv6 brackets intact.
  const m = /^(\[[^\]]+\]|[^:]+)(?::\d+)?$/.exec(hostHeader.trim());
  return (m?.[1] ?? hostHeader).toLowerCase();
}

function forbidden(reason: string): NextResponse {
  return NextResponse.json({ error: `Forbidden: ${reason}` }, { status: 403 });
}

export function middleware(req: NextRequest): NextResponse {
  const host = hostnameOf(req.headers.get('host'));
  if (!LOOPBACK_HOSTS.has(host)) return forbidden('library APIs are only served on localhost');

  const fetchSite = req.headers.get('sec-fetch-site');
  if (fetchSite === 'cross-site') return forbidden('cross-site requests are not allowed');

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    const origin = req.headers.get('origin');
    if (origin) {
      let originHost = '';
      try {
        originHost = new URL(origin).hostname.toLowerCase();
      } catch {
        return forbidden('malformed Origin');
      }
      if (!LOOPBACK_HOSTS.has(originHost)) return forbidden('Origin must be local');
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/api/library/:path*', '/api/media/:path*', '/api/jobs/:path*', '/api/settings/:path*', '/api/system/:path*'],
};
