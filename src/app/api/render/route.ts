import { NextRequest, NextResponse } from 'next/server';

/**
 * Server-side render endpoint.
 * In v1, rendering is done client-side using Canvas + MediaRecorder.
 * This endpoint is a stub for future FFmpeg-based server rendering.
 */
export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const settingsRaw = formData.get('settings');

    if (!settingsRaw || typeof settingsRaw !== 'string') {
      return NextResponse.json({ error: 'Missing render settings' }, { status: 400 });
    }

    const settings = JSON.parse(settingsRaw);

    // For v1, return a message directing to client-side rendering
    // Server-side FFmpeg rendering will be added in v2
    return NextResponse.json({
      status: 'not_implemented',
      message: 'Server-side rendering requires FFmpeg. Use the client-side export button instead.',
      settings,
    }, { status: 501 });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Render request failed' },
      { status: 500 }
    );
  }
}
