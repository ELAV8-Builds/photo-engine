import { NextRequest, NextResponse } from 'next/server';
import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import fs from 'fs';

const execAsync = promisify(exec);

const AUDIO_DIR = path.join(process.cwd(), 'public', 'audio');

const YT_DLP_PATHS = [
  '/Users/beaubratton/Library/Python/3.11/bin/yt-dlp',
  '/Library/Frameworks/Python.framework/Versions/3.11/bin/yt-dlp',
  '/opt/homebrew/bin/yt-dlp',
  '/usr/local/bin/yt-dlp',
  'yt-dlp',
];

function findYtDlp(): string {
  for (const p of YT_DLP_PATHS) {
    if (p === 'yt-dlp') return p;
    if (fs.existsSync(p)) return p;
  }
  return 'yt-dlp';
}

function stripPlaylistParams(url: string): string {
  try {
    const parsed = new URL(url);
    parsed.searchParams.delete('list');
    parsed.searchParams.delete('index');
    parsed.searchParams.delete('start_radio');
    return parsed.toString();
  } catch {
    return url;
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const rawUrl = body?.url;

    if (typeof rawUrl !== 'string' || !rawUrl.trim()) {
      return NextResponse.json({ error: 'Missing YouTube URL' }, { status: 400 });
    }

    const ytRegex = /^(https?:\/\/)?(www\.)?(youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/shorts\/)/;
    if (!ytRegex.test(rawUrl)) {
      return NextResponse.json({ error: 'Invalid YouTube URL' }, { status: 400 });
    }

    const url = stripPlaylistParams(rawUrl);
    const ytdlp = findYtDlp();

    if (!fs.existsSync(AUDIO_DIR)) {
      fs.mkdirSync(AUDIO_DIR, { recursive: true });
    }

    const outputId = `yt-${Date.now()}`;
    const outputPath = path.join(AUDIO_DIR, `${outputId}.mp3`);

    const { stdout: infoJson } = await execAsync(
      `"${ytdlp}" --no-playlist --no-warnings --dump-json --no-download "${url}"`,
      { timeout: 30000 }
    );

    let title = 'YouTube Audio';
    let duration = 0;
    try {
      const info = JSON.parse(infoJson);
      if (typeof info.title === 'string') title = info.title;
      if (typeof info.duration === 'number') duration = info.duration;
    } catch {
      // Parse failed, continue with defaults
    }

    await execAsync(
      `"${ytdlp}" --no-playlist --no-warnings -x --audio-format mp3 --audio-quality 192K -o "${outputPath}" "${url}"`,
      { timeout: 120000 }
    );

    if (!fs.existsSync(outputPath)) {
      return NextResponse.json({ error: 'Audio extraction failed — file not created' }, { status: 500 });
    }

    return NextResponse.json({
      title,
      duration,
      url: `/audio/${outputId}.mp3`,
      source: 'youtube',
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Unknown error';

    if (message.includes('ENOENT') || message.includes('not found')) {
      return NextResponse.json(
        { error: 'yt-dlp is not installed. Install with: pip install yt-dlp' },
        { status: 500 }
      );
    }

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
