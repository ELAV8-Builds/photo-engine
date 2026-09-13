/**
 * Safe process execution for ffmpeg / ffprobe and other local tools.
 *
 * - Always `spawn` with an argument array. Never build a shell string.
 * - Children run under `nice` so the UI and the rest of the machine stay
 *   responsive; the niceness comes from the active performance profile.
 * - Every run takes an AbortSignal (job cancellation) and a timeout.
 * - Stderr is kept as a bounded tail for diagnostics.
 */

import { spawn, type ChildProcess } from 'child_process';
import { assertServer, globalSingleton } from '../runtime';
import { createLogger } from '../log';
import { findTool, requireTool } from './binaries';

assertServer();

const log = createLogger('proc');

/**
 * Every live child is tracked so a server shutdown (Ctrl-C, SIGTERM, uncaught
 * exit) takes its ffmpeg processes down with it instead of leaving orphans
 * burning CPU. `nice` execs the tool in-place, so the tracked PID is the tool.
 */
const children = globalSingleton<Set<ChildProcess>>('__photoforge_children', () => {
  const set = new Set<ChildProcess>();
  const reap = () => {
    set.forEach((child) => {
      if (child.exitCode === null && child.signalCode === null) child.kill('SIGTERM');
    });
  };
  process.once('exit', reap);
  for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP'] as const) {
    process.once(sig, () => {
      reap();
      // Re-raise so Next.js/Node perform their normal shutdown.
      setTimeout(() => process.kill(process.pid, sig), 50).unref();
    });
  }
  return set;
});

export interface RunOptions {
  /** Cancel the child. */
  signal?: AbortSignal;
  /** Kill the child after this many ms. Default 30 minutes. */
  timeoutMs?: number;
  /** Unix niceness 0–19. Undefined = inherit. */
  nice?: number;
  /** Bytes of stderr to retain for error messages. */
  stderrTailBytes?: number;
  /** Receive stderr lines as they arrive (progress parsing). */
  onStderrLine?: (line: string) => void;
  /** Collect stdout as UTF-8 text (ffprobe JSON). Default true. */
  captureStdout?: boolean;
}

export interface RunResult {
  code: number;
  stdout: string;
  stderrTail: string;
  durationMs: number;
}

export class ProcessError extends Error {
  constructor(
    public readonly command: string,
    public readonly code: number | null,
    public readonly stderrTail: string,
    public readonly cancelled: boolean,
  ) {
    super(
      cancelled
        ? `${command} was cancelled`
        : `${command} exited with code ${code ?? 'null'}${stderrTail ? `: ${lastLine(stderrTail)}` : ''}`,
    );
    this.name = 'ProcessError';
  }
}

function lastLine(text: string): string {
  const lines = text.trim().split('\n');
  return lines[lines.length - 1]?.trim() ?? '';
}

/**
 * Run an executable with arguments. Resolves on exit code 0, rejects with
 * ProcessError otherwise. Cancellation sends SIGTERM, then SIGKILL after 3 s.
 */
export function run(executable: string, args: string[], opts: RunOptions = {}): Promise<RunResult> {
  const {
    signal,
    timeoutMs = 30 * 60_000,
    nice,
    stderrTailBytes = 8 * 1024,
    onStderrLine,
    captureStdout = true,
  } = opts;

  let command = executable;
  let finalArgs = args;
  if (nice !== undefined) {
    const nicePath = findTool('nice');
    if (nicePath) {
      command = nicePath;
      finalArgs = ['-n', String(Math.max(0, Math.min(19, Math.round(nice)))), executable, ...args];
    }
  }

  return new Promise<RunResult>((resolve, reject) => {
    if (signal?.aborted) {
      reject(new ProcessError(executable, null, '', true));
      return;
    }

    const startedAt = Date.now();
    const child = spawn(command, finalArgs, { stdio: ['ignore', 'pipe', 'pipe'] });
    children.add(child);
    log.debug('spawn', { command, args: finalArgs.slice(0, 12) });

    let stdout = '';
    let stderrTail = '';
    let stderrLineBuf = '';
    let cancelled = false;
    let settled = false;

    const appendTail = (chunk: string) => {
      stderrTail += chunk;
      if (stderrTail.length > stderrTailBytes) stderrTail = stderrTail.slice(-stderrTailBytes);
    };

    child.stdout?.on('data', (buf: Buffer) => {
      if (captureStdout) stdout += buf.toString('utf8');
    });
    child.stderr?.on('data', (buf: Buffer) => {
      const text = buf.toString('utf8');
      appendTail(text);
      if (onStderrLine) {
        stderrLineBuf += text;
        // ffmpeg emits progress with \r; treat both separators as line ends.
        const parts = stderrLineBuf.split(/\r\n|\r|\n/);
        stderrLineBuf = parts.pop() ?? '';
        for (const line of parts) if (line) onStderrLine(line);
      }
    });

    const killChild = () => {
      if (child.exitCode !== null || child.signalCode !== null) return;
      child.kill('SIGTERM');
      setTimeout(() => {
        if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
      }, 3000).unref();
    };

    const onAbort = () => {
      cancelled = true;
      killChild();
    };
    signal?.addEventListener('abort', onAbort, { once: true });

    const timer = setTimeout(() => {
      appendTail(`\n[timeout after ${timeoutMs} ms]`);
      killChild();
    }, timeoutMs);
    timer.unref();

    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
      children.delete(child);
      fn();
    };

    child.on('error', (err) => {
      finish(() => reject(new ProcessError(executable, null, `${stderrTail}\n${err.message}`, cancelled)));
    });

    child.on('close', (code) => {
      finish(() => {
        if (code === 0 && !cancelled) {
          resolve({ code, stdout, stderrTail, durationMs: Date.now() - startedAt });
        } else {
          reject(new ProcessError(executable, code, stderrTail, cancelled));
        }
      });
    });
  });
}

// ---------------------------------------------------------------------------
// ffmpeg / ffprobe conveniences
// ---------------------------------------------------------------------------

export interface FfmpegOptions extends RunOptions {
  /** Threads for filters/encoders. Default 2. */
  threads?: number;
  /** Prepend hardware decode flags when the platform supports it. Default true. */
  hwaccel?: boolean;
  /** Report 0–1 progress parsed from ffmpeg's "time=" output. */
  onProgress?: (fraction: number) => void;
  /** Known input duration, required for onProgress. */
  durationSec?: number;
}

/** Hardware decode flags for the current platform (VideoToolbox on macOS). */
export function hwaccelArgs(): string[] {
  return process.platform === 'darwin' ? ['-hwaccel', 'videotoolbox'] : [];
}

const TIME_RE = /time=\s*(\d+):(\d+):(\d+(?:\.\d+)?)/;

/**
 * Run ffmpeg with sane defaults: no banner, no stdin, overwrite outputs,
 * bounded threads, optional hardware decode. Callers pass input/filter/output
 * arguments only. Hardware decode flags must precede `-i`, so pass `inputArgs`
 * separately from the rest.
 */
export async function runFfmpeg(inputArgs: string[], restArgs: string[], opts: FfmpegOptions = {}): Promise<RunResult> {
  const { threads = 2, hwaccel = true, onProgress, durationSec, ...runOpts } = opts;
  const ffmpeg = requireTool('ffmpeg');

  const args = [
    '-hide_banner',
    '-nostdin',
    '-y',
    '-loglevel', 'error',
    '-stats',
    ...(hwaccel ? hwaccelArgs() : []),
    ...inputArgs,
    // Codec threads and filter-graph threads (v360, sobel…) both honour the budget.
    '-threads', String(threads),
    '-filter_threads', String(threads),
    ...restArgs,
  ];

  const onStderrLine =
    onProgress && durationSec && durationSec > 0
      ? (line: string) => {
          const m = TIME_RE.exec(line);
          if (!m) return;
          const secs = Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]);
          onProgress(Math.max(0, Math.min(1, secs / durationSec)));
        }
      : runOpts.onStderrLine;

  return run(ffmpeg, args, { ...runOpts, onStderrLine });
}

/** Run ffprobe and parse its JSON output. */
export async function runFfprobeJson<T = unknown>(args: string[], opts: RunOptions = {}): Promise<T> {
  const ffprobe = requireTool('ffprobe');
  const result = await run(ffprobe, ['-hide_banner', '-loglevel', 'error', '-print_format', 'json', ...args], {
    timeoutMs: 60_000,
    ...opts,
  });
  return JSON.parse(result.stdout) as T;
}

/** ffmpeg version string, or null if unavailable. */
export async function ffmpegVersion(): Promise<string | null> {
  const ffmpeg = findTool('ffmpeg');
  if (!ffmpeg) return null;
  try {
    const res = await run(ffmpeg, ['-version'], { timeoutMs: 10_000 });
    return res.stdout.split('\n')[0]?.replace(/^ffmpeg version\s+/, '').split(' ')[0] ?? null;
  } catch {
    return null;
  }
}

/** Whether ffmpeg lists videotoolbox as an available hwaccel. */
export async function hasVideoToolbox(): Promise<boolean> {
  const ffmpeg = findTool('ffmpeg');
  if (!ffmpeg || process.platform !== 'darwin') return false;
  try {
    const res = await run(ffmpeg, ['-hide_banner', '-hwaccels'], { timeoutMs: 10_000 });
    return /videotoolbox/.test(res.stdout);
  } catch {
    return false;
  }
}
