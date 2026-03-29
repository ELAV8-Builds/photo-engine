'use client';

import { useState, useEffect, useRef } from 'react';
import { PhotoFile, MusicTrack, RenderProgress } from '@/types';
import { TEMPLATES } from '@/lib/templates';

interface RenderStepProps {
  photos: PhotoFile[];
  selectedTemplate: string | null;
  music: MusicTrack | null;
  title: string;
  onTitleChange: (t: string) => void;
  durationPerPhoto: number;
  aspectRatio: '16:9' | '9:16' | '1:1';
  outputQuality: '720p' | '1080p' | '4k';
  onQualityChange: (q: '720p' | '1080p' | '4k') => void;
  onBack: () => void;
}

export default function RenderStep({
  photos,
  selectedTemplate,
  music,
  title,
  onTitleChange,
  durationPerPhoto,
  aspectRatio,
  outputQuality,
  onQualityChange,
  onBack,
}: RenderStepProps) {
  const [progress, setProgress] = useState<RenderProgress>({
    status: 'idle',
    percent: 0,
    currentFrame: 0,
    totalFrames: 0,
    message: '',
  });
  const [previewIndex, setPreviewIndex] = useState(0);
  const previewTimer = useRef<ReturnType<typeof setInterval>>();

  const selectedPhotos = photos.filter(p => p.selected);
  const template = TEMPLATES.find(t => t.id === selectedTemplate);
  const totalDuration = selectedPhotos.length * durationPerPhoto;

  // Auto-cycle preview
  useEffect(() => {
    if (selectedPhotos.length === 0) return;
    previewTimer.current = setInterval(() => {
      setPreviewIndex(prev => (prev + 1) % selectedPhotos.length);
    }, durationPerPhoto * 1000);
    return () => clearInterval(previewTimer.current);
  }, [selectedPhotos.length, durationPerPhoto]);

  const handleRender = async () => {
    if (progress.status === 'rendering' || progress.status === 'encoding') return;

    setProgress({ status: 'preparing', percent: 5, currentFrame: 0, totalFrames: 0, message: 'Preparing assets...' });

    try {
      // Build form data with photos and settings
      const formData = new FormData();
      formData.append('settings', JSON.stringify({
        template: selectedTemplate,
        title,
        durationPerPhoto,
        aspectRatio,
        outputQuality,
        photoCount: selectedPhotos.length,
        hasMusic: !!music,
      }));

      // Append photos
      for (const photo of selectedPhotos) {
        formData.append('photos', photo.file, photo.name);
        formData.append('photoMeta', JSON.stringify({
          id: photo.id,
          faces: photo.faces,
          width: photo.width,
          height: photo.height,
        }));
      }

      // Append music
      if (music?.file) {
        formData.append('music', music.file, music.name);
      } else if (music?.url) {
        formData.append('musicUrl', music.url);
      }

      setProgress({ status: 'rendering', percent: 15, currentFrame: 0, totalFrames: 100, message: 'Rendering frames...' });

      const res = await fetch('/api/render', {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(typeof data.error === 'string' ? data.error : 'Render failed');
      }

      // Simulate progress for client-side rendering
      for (let i = 20; i <= 90; i += 10) {
        await new Promise(r => setTimeout(r, 500));
        setProgress(prev => ({
          ...prev,
          percent: i,
          message: i < 60 ? 'Rendering frames...' : 'Encoding video...',
          status: i < 60 ? 'rendering' : 'encoding',
        }));
      }

      const data = await res.json();

      setProgress({
        status: 'complete',
        percent: 100,
        currentFrame: 100,
        totalFrames: 100,
        message: 'Export complete!',
        outputUrl: typeof data.url === 'string' ? data.url : undefined,
      });
    } catch (e) {
      setProgress({
        status: 'error',
        percent: 0,
        currentFrame: 0,
        totalFrames: 0,
        message: '',
        error: e instanceof Error ? e.message : 'Render failed. Server-side rendering requires FFmpeg.',
      });
    }
  };

  const handleClientRender = async () => {
    // Client-side canvas-based rendering fallback
    setProgress({ status: 'rendering', percent: 10, currentFrame: 0, totalFrames: selectedPhotos.length, message: 'Creating slideshow...' });

    try {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Canvas not supported');

      const dims = getResolution(aspectRatio, outputQuality);
      canvas.width = dims.width;
      canvas.height = dims.height;

      // Use MediaRecorder to capture canvas
      const stream = canvas.captureStream(30);

      // Add audio track if available
      if (music?.url) {
        try {
          const audioEl = new Audio(music.url);
          audioEl.crossOrigin = 'anonymous';
          const audioCtx = new AudioContext();
          const source = audioCtx.createMediaElementSource(audioEl);
          const dest = audioCtx.createMediaStreamDestination();
          source.connect(dest);
          source.connect(audioCtx.destination);
          for (const track of dest.stream.getAudioTracks()) {
            stream.addTrack(track);
          }
          audioEl.play();
        } catch {
          // Audio mixing may fail due to CORS, continue without audio
        }
      }

      const recorder = new MediaRecorder(stream, {
        mimeType: 'video/webm;codecs=vp9',
        videoBitsPerSecond: outputQuality === '4k' ? 20000000 : outputQuality === '1080p' ? 8000000 : 4000000,
      });

      const chunks: Blob[] = [];
      recorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };

      recorder.start();

      // Render each photo
      for (let i = 0; i < selectedPhotos.length; i++) {
        setProgress(prev => ({
          ...prev,
          percent: 10 + Math.round((i / selectedPhotos.length) * 80),
          currentFrame: i + 1,
          message: `Rendering photo ${i + 1} of ${selectedPhotos.length}...`,
        }));

        await renderPhotoToCanvas(ctx, selectedPhotos[i], canvas.width, canvas.height, template?.style || 'cinematic', durationPerPhoto);
      }

      // Stop recording
      recorder.stop();

      await new Promise<void>((resolve) => {
        recorder.onstop = () => resolve();
      });

      setProgress(prev => ({ ...prev, percent: 95, status: 'encoding', message: 'Encoding...' }));

      const blob = new Blob(chunks, { type: 'video/webm' });
      const url = URL.createObjectURL(blob);

      setProgress({
        status: 'complete',
        percent: 100,
        currentFrame: selectedPhotos.length,
        totalFrames: selectedPhotos.length,
        message: 'Export complete!',
        outputUrl: url,
      });
    } catch (e) {
      setProgress({
        status: 'error',
        percent: 0,
        currentFrame: 0,
        totalFrames: 0,
        message: '',
        error: e instanceof Error ? e.message : 'Client-side render failed',
      });
    }
  };

  const isRendering = progress.status === 'rendering' || progress.status === 'encoding' || progress.status === 'preparing';

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-bold text-white mb-1">Review & Export</h2>
        <p className="text-sm text-text-muted">Preview your presentation before exporting</p>
      </div>

      {/* Preview */}
      <div className="card-glow overflow-hidden">
        <div
          className="relative bg-black"
          style={{ aspectRatio: aspectRatio.replace(':', '/') }}
        >
          {selectedPhotos.length > 0 && (
            <img
              src={selectedPhotos[previewIndex]?.url || ''}
              alt={`Preview ${previewIndex + 1}`}
              className="absolute inset-0 w-full h-full object-cover transition-opacity duration-1000"
              style={{
                filter: template?.style === 'retro' ? 'saturate(0.6) sepia(0.3)' : undefined,
              }}
            />
          )}

          {/* Overlay info */}
          <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/80 to-transparent p-4">
            <div className="flex items-end justify-between">
              <div>
                <p className="text-xs text-accent-gold font-mono">{template?.name || 'No template'}</p>
                <p className="text-[10px] text-text-muted">
                  {selectedPhotos.length} photos • {Math.round(totalDuration)}s
                  {music ? ` • ${music.name}` : ' • No music'}
                </p>
              </div>
              <span className="text-xs text-text-muted font-mono">
                {previewIndex + 1}/{selectedPhotos.length}
              </span>
            </div>
          </div>

          {/* Template style overlay */}
          {template?.style === 'retro' && (
            <div className="absolute inset-0 pointer-events-none" style={{
              background: 'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,0,0,0.08) 2px, rgba(0,0,0,0.08) 4px)',
            }} />
          )}
          {template?.style === 'glitch' && (
            <div className="absolute inset-0 pointer-events-none mix-blend-screen" style={{
              background: 'linear-gradient(transparent 50%, rgba(0,255,255,0.02) 50%)',
              backgroundSize: '100% 4px',
            }} />
          )}
        </div>
      </div>

      {/* Settings */}
      <div className="card-glow p-5">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {/* Title */}
          <div className="sm:col-span-2">
            <label htmlFor="render-title" className="text-xs text-text-muted block mb-1">Title</label>
            <input
              id="render-title"
              type="text"
              value={title}
              onChange={(e) => onTitleChange(e.target.value)}
              placeholder="My Photo Presentation"
              disabled={isRendering}
              className="w-full px-3 py-2 bg-bg-input border border-border-subtle rounded-lg text-sm text-white placeholder:text-text-muted focus:border-accent-gold focus:outline-none disabled:opacity-50"
            />
          </div>

          {/* Quality */}
          <div>
            <p className="text-xs text-text-muted mb-1">Quality</p>
            <div className="flex gap-1">
              {(['720p', '1080p', '4k'] as const).map((q) => (
                <button
                  key={q}
                  onClick={() => onQualityChange(q)}
                  disabled={isRendering}
                  className={`flex-1 py-2 rounded-lg text-xs font-mono font-bold transition-all border ${
                    outputQuality === q
                      ? 'bg-accent-gold/10 border-accent-gold/40 text-accent-gold'
                      : 'bg-bg-input border-border-subtle text-text-muted hover:text-white disabled:opacity-50'
                  }`}
                  aria-pressed={outputQuality === q}
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Render Progress */}
      {progress.status !== 'idle' && (
        <div className="card-glow p-5">
          {progress.status === 'complete' ? (
            <div className="text-center">
              <div className="w-16 h-16 mx-auto rounded-full bg-accent-gold/10 border border-accent-gold/30 flex items-center justify-center mb-3">
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" className="text-accent-gold" strokeWidth="2">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              </div>
              <p className="text-white font-bold text-lg">Export Complete!</p>
              <p className="text-sm text-text-muted mt-1">Your video is ready to download</p>
              {progress.outputUrl && (
                <a
                  href={progress.outputUrl}
                  download={`${title || 'photoforge-export'}.webm`}
                  className="btn-gold inline-flex items-center gap-2 mt-4"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                    <polyline points="7 10 12 15 17 10" />
                    <line x1="12" y1="15" x2="12" y2="3" />
                  </svg>
                  Download Video
                </a>
              )}
            </div>
          ) : progress.status === 'error' ? (
            <div className="text-center">
              <p className="text-red-400 font-bold mb-2">Render Failed</p>
              <p className="text-sm text-red-400/80">{progress.error}</p>
              <button onClick={() => setProgress({ status: 'idle', percent: 0, currentFrame: 0, totalFrames: 0, message: '' })} className="btn-outline mt-3 text-xs">
                Try Again
              </button>
            </div>
          ) : (
            <div>
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm text-white font-medium">{progress.message}</p>
                <span className="text-xs text-accent-gold font-mono">{progress.percent}%</span>
              </div>
              <div className="progress-bar">
                <div className="progress-bar-fill" style={{ width: `${progress.percent}%` }} />
              </div>
            </div>
          )}
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center justify-between pt-4">
        <button onClick={onBack} disabled={isRendering} className="btn-outline">
          Back
        </button>
        <div className="flex gap-3">
          {progress.status === 'idle' || progress.status === 'error' ? (
            <>
              <button
                onClick={handleClientRender}
                disabled={isRendering || selectedPhotos.length < 2}
                className="btn-gold inline-flex items-center gap-2"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polygon points="5 3 19 12 5 21" />
                </svg>
                Export Video
              </button>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function getResolution(aspect: string, quality: string): { width: number; height: number } {
  const q = quality === '4k' ? 2160 : quality === '1080p' ? 1080 : 720;
  switch (aspect) {
    case '9:16': return { width: Math.round(q * 9 / 16), height: q };
    case '1:1': return { width: q, height: q };
    default: return { width: Math.round(q * 16 / 9), height: q };
  }
}

async function renderPhotoToCanvas(
  ctx: CanvasRenderingContext2D,
  photo: PhotoFile,
  width: number,
  height: number,
  style: string,
  duration: number
): Promise<void> {
  const img = new Image();
  img.crossOrigin = 'anonymous';

  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error('Failed to load image'));
    img.src = photo.url;
  });

  const fps = 30;
  const frames = Math.round(duration * fps);

  for (let frame = 0; frame < frames; frame++) {
    const progress = frame / frames;

    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, width, height);

    ctx.save();

    // Apply style-specific transformations
    switch (style) {
      case 'cinematic': {
        // Ken Burns zoom
        const zoom = 1 + progress * 0.15;
        const cx = photo.faces.length > 0
          ? (photo.faces[0].x + photo.faces[0].width / 2) / photo.width
          : 0.5;
        const cy = photo.faces.length > 0
          ? (photo.faces[0].y + photo.faces[0].height / 2) / photo.height
          : 0.5;
        ctx.translate(width * 0.5, height * 0.5);
        ctx.scale(zoom, zoom);
        ctx.translate(-width * cx, -height * cy);
        break;
      }
      case 'dynamic': {
        const zoom = 1.1 + Math.sin(progress * Math.PI) * 0.05;
        ctx.translate(width * 0.5, height * 0.5);
        ctx.scale(zoom, zoom);
        ctx.translate(-width * 0.5, -height * 0.5);
        break;
      }
      case 'parallax': {
        const offset = (progress - 0.5) * 30;
        ctx.translate(offset, 0);
        break;
      }
      default:
        break;
    }

    // Draw image covering canvas
    const scale = Math.max(width / img.naturalWidth, height / img.naturalHeight);
    const dw = img.naturalWidth * scale;
    const dh = img.naturalHeight * scale;
    ctx.drawImage(img, (width - dw) / 2, (height - dh) / 2, dw, dh);

    ctx.restore();

    // Fade in/out
    if (progress < 0.1) {
      ctx.fillStyle = `rgba(0,0,0,${1 - progress * 10})`;
      ctx.fillRect(0, 0, width, height);
    } else if (progress > 0.9) {
      ctx.fillStyle = `rgba(0,0,0,${(progress - 0.9) * 10})`;
      ctx.fillRect(0, 0, width, height);
    }

    // Yield to browser
    if (frame % 5 === 0) {
      await new Promise(r => requestAnimationFrame(r));
    }
  }
}
