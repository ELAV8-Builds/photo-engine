import { NextRequest, NextResponse } from 'next/server';
import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import fs from 'fs';

const execAsync = promisify(exec);

const AUDIO_DIR = path.join(process.cwd(), 'public', 'audio');

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const url = body?.url;

    if (typeof url !== 'string' || !url.trim()) {
      return NextResponse.json({ error: 'Missing YouTube URL' }, { status: 400 });
    }

    // Validate URL pattern
    const ytRegex = /^(https?:\/\/)?(www\.)?(youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/shorts\/)/;
    if (!ytRegex.test(url)) {
      return NextResponse.json({ error: 'Invalid YouTube URL' }, { status: 400 });
    }

    // Ensure audio directory exists
    if (!fs.existsSync(AUDIO_DIR)) {
      fs.mkdirSync(AUDIO_DIR, { recursive: true });
    }

    const outputId = `yt-${Date.now()}`;
    const outputPath = path.join(AUDIO_DIR, `${outputId}.mp3`);

    // Get video info first
    const { stdout: infoJson } = await execAsync(
      `yt-dlp --dump-json --no-download "${url}"`,
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

    // Download audio only as MP3
    await execAsync(
      `yt-dlp -x --audio-format mp3 --audio-quality 192K -o "${outputPath}" "${url}"`,
      { timeout: 120000 }
    );

    // Verify file exists
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
