'use client';

import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { MediaFile, MusicTrack, RenderProgress, SmartTemplate, TemplateSlot } from '@/types';
import { SMART_TEMPLATES, assignMediaToSlots, formatDuration } from '@/lib/templates';

interface RenderStepProps {
  photos: MediaFile[];
  selectedTemplate: string | null;
  music: MusicTrack | null;
  title: string;
  onTitleChange: (t: string) => void;
  durationPerPhoto?: number; // Legacy prop — ignored. Duration comes from template slots.
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
  const [previewSlotIndex, setPreviewSlotIndex] = useState(0);
  const [previewFade, setPreviewFade] = useState(true);
  const previewFadeTimer = useRef<ReturnType<typeof setTimeout>>();
  const previewAdvanceTimer = useRef<ReturnType<typeof setTimeout>>();

  const selectedMedia = useMemo(() => photos.filter(p => p.selected), [photos]);
  const template = SMART_TEMPLATES.find(t => t.id === selectedTemplate) || null;

  const mediaIds = useMemo(() => selectedMedia.map(m => m.id), [selectedMedia]);
  const slotAssignments = useMemo(
    () => (template ? assignMediaToSlots(template, mediaIds) : []),
    [template, mediaIds],
  );

  const mediaById = useMemo(() => {
    const map = new Map<string, MediaFile>();
    selectedMedia.forEach(m => map.set(m.id, m));
    return map;
  }, [selectedMedia]);

  // ------------------------------------------------------------------
  //  Preview: cycle through slots at per-slot timing
  // ------------------------------------------------------------------
  useEffect(() => {
    if (!template || selectedMedia.length === 0) return;

    const slot = template.slots[previewSlotIndex];
    if (!slot) return;

    // Use the slot's own duration, clamped to at least 600ms for UX
    const durationMs = Math.max(slot.duration * 1000, 600);

    // Start fade-out 300ms before switching
    previewFadeTimer.current = setTimeout(() => setPreviewFade(false), durationMs - 300);
    previewAdvanceTimer.current = setTimeout(() => {
      setPreviewSlotIndex(prev => (prev + 1) % template.slots.length);
      setPreviewFade(true);
    }, durationMs);

    return () => {
      clearTimeout(previewFadeTimer.current);
      clearTimeout(previewAdvanceTimer.current);
    };
  }, [previewSlotIndex, template, selectedMedia.length]);

  // ------------------------------------------------------------------
  //  Resolve current preview image / thumbnail
  // ------------------------------------------------------------------
  const currentMedia = mediaById.get(slotAssignments[previewSlotIndex] || '');
  const previewSrc = currentMedia
    ? currentMedia.type === 'video'
      ? currentMedia.thumbnailUrl || currentMedia.url
      : currentMedia.url
    : null;

  const currentSlot = template?.slots[previewSlotIndex] ?? null;

  // ------------------------------------------------------------------
  //  Server-side render (POST to /api/render)
  // ------------------------------------------------------------------
  const handleRender = useCallback(async () => {
    if (!template) return;
    if (progress.status === 'rendering' || progress.status === 'encoding') return;

    setProgress({ status: 'preparing', percent: 5, currentFrame: 0, totalFrames: 0, message: 'Preparing assets...' });

    try {
      const formData = new FormData();
      formData.append('settings', JSON.stringify({
        template: template.id,
        slots: template.slots,
        slotAssignments,
        title,
        aspectRatio,
        outputQuality,
        mediaCount: selectedMedia.length,
        totalDuration: template.totalDuration,
        hasMusic: !!music,
      }));

      for (const media of selectedMedia) {
        formData.append('media', media.file, media.name);
        formData.append('mediaMeta', JSON.stringify({
          id: media.id,
          type: media.type,
          faces: media.faces,
          width: media.width,
          height: media.height,
          duration: media.duration,
          trimStart: media.trimStart,
          trimEnd: media.trimEnd,
        }));
      }

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
  }, [template, slotAssignments, selectedMedia, title, aspectRatio, outputQuality, music, progress.status]);

  // ------------------------------------------------------------------
  //  Client-side canvas render
  // ------------------------------------------------------------------
  const handleClientRender = useCallback(async () => {
    if (!template) return;

    setProgress({ status: 'rendering', percent: 10, currentFrame: 0, totalFrames: template.slots.length, message: 'Creating slideshow...' });

    try {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Canvas not supported');

      const dims = getResolution(aspectRatio, outputQuality);
      canvas.width = dims.width;
      canvas.height = dims.height;

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

      // Render each slot with its assigned media
      for (let i = 0; i < template.slots.length; i++) {
        const slot = template.slots[i];
        const assignedMediaId = slotAssignments[i] || '';
        const assignedMedia = mediaById.get(assignedMediaId);

        setProgress(prev => ({
          ...prev,
          percent: 10 + Math.round((i / template.slots.length) * 80),
          currentFrame: i + 1,
          message: `Rendering slot ${i + 1} of ${template.slots.length}...`,
        }));

        if (assignedMedia) {
          await renderSlotToCanvas(
            ctx,
            assignedMedia,
            canvas.width,
            canvas.height,
            slot,
          );
        } else {
          // Empty slot — hold black for slot duration
          ctx.fillStyle = '#000';
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          await holdFrames(slot.duration);
        }

        // Render inter-slot transition if not the last slot
        if (i < template.slots.length - 1) {
          const nextMediaId = slotAssignments[i + 1] || '';
          const nextMedia = mediaById.get(nextMediaId);
          if (assignedMedia && nextMedia) {
            await renderTransition(
              ctx,
              assignedMedia,
              nextMedia,
              canvas.width,
              canvas.height,
              template.slots[i + 1].transition,
            );
          }
        }
      }

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
        currentFrame: template.slots.length,
        totalFrames: template.slots.length,
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
  }, [template, slotAssignments, selectedMedia, mediaById, aspectRatio, outputQuality, music]);

  const isRendering = progress.status === 'rendering' || progress.status === 'encoding' || progress.status === 'preparing';

  // ------------------------------------------------------------------
  //  Compute preview style filter for template style overlays
  // ------------------------------------------------------------------
  const previewFilter = template?.style === 'retro'
    ? 'saturate(0.6) contrast(1.2) sepia(0.3)'
    : template?.style === 'glitch'
      ? 'hue-rotate(10deg) contrast(1.1)'
      : undefined;

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
          {previewSrc ? (
            <img
              src={previewSrc}
              alt={`Preview slot ${previewSlotIndex + 1}`}
              className="absolute inset-0 w-full h-full object-cover transition-opacity duration-300"
              style={{
                opacity: previewFade ? 1 : 0,
                filter: previewFilter,
              }}
            />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="text-text-muted text-xs">No media selected</span>
            </div>
          )}

          {/* Slot indicator dots */}
          {template && selectedMedia.length > 0 && (
            <div className="absolute top-3 left-1/2 -translate-x-1/2 flex gap-1">
              {template.slots.slice(0, 10).map((_, i) => (
                <div
                  key={i}
                  className="w-1.5 h-1.5 rounded-full transition-all duration-200"
                  style={{
                    background: i === previewSlotIndex ? (template.color || '#FFD700') : 'rgba(255,255,255,0.3)',
                    transform: i === previewSlotIndex ? 'scale(1.5)' : 'scale(1)',
                  }}
                />
              ))}
              {template.slots.length > 10 && (
                <span className="text-[8px] text-white/50 ml-0.5">+{template.slots.length - 10}</span>
              )}
            </div>
          )}

          {/* Current slot effect badge */}
          {currentSlot && selectedMedia.length > 0 && (
            <div className="absolute top-3 right-3 bg-black/60 backdrop-blur-sm rounded px-2 py-0.5">
              <span className="text-[9px] font-mono text-accent-gold">{currentSlot.effect}</span>
            </div>
          )}

          {/* Video indicator badge for current media */}
          {currentMedia?.type === 'video' && (
            <div className="absolute top-3 left-3 bg-blue-500/70 backdrop-blur-sm rounded px-2 py-0.5 flex items-center gap-1">
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" className="text-white" strokeWidth="2">
                <rect x="2" y="4" width="20" height="16" rx="2" />
                <path d="M2 8h20" />
              </svg>
              <span className="text-[9px] font-mono text-white">VIDEO</span>
            </div>
          )}

          {/* Overlay info */}
          <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/80 to-transparent p-4">
            <div className="flex items-end justify-between">
              <div>
                <p className="text-xs text-accent-gold font-mono">{template?.name || 'No template'}</p>
                <p className="text-[10px] text-text-muted">
                  {selectedMedia.length} media &bull; {template ? formatDuration(template.totalDuration) : '0s'}
                  {music ? ` \u2022 ${music.name}` : ' \u2022 No music'}
                </p>
              </div>
              <div className="text-right">
                <span className="text-xs text-text-muted font-mono">
                  {previewSlotIndex + 1}/{template?.slots.length ?? 0}
                </span>
                {currentSlot && (
                  <span className="text-[9px] text-text-muted/70 font-mono block">
                    {currentSlot.duration}s &middot; {currentSlot.transition}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Template style overlay: Retro scanlines */}
          {template?.style === 'retro' && (
            <div className="absolute inset-0 pointer-events-none" style={{
              background: 'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,0,0,0.08) 2px, rgba(0,0,0,0.08) 4px)',
            }} />
          )}
          {/* Template style overlay: Glitch CRT */}
          {template?.style === 'glitch' && (
            <div className="absolute inset-0 pointer-events-none mix-blend-screen" style={{
              background: 'linear-gradient(transparent 50%, rgba(0,255,255,0.02) 50%)',
              backgroundSize: '100% 4px',
            }} />
          )}
        </div>
      </div>

      {/* Slot Timeline Bar */}
      {template && (
        <div className="card-glow p-4">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs text-text-muted font-medium">Timeline</p>
            <span className="text-xs text-accent-gold font-mono">
              {formatDuration(template.totalDuration)} total &bull; {template.slots.length} slots
            </span>
          </div>
          <div className="flex rounded-lg overflow-hidden h-8 gap-px bg-black/20">
            {template.slots.map((slot, i) => {
              const widthPercent = (slot.duration / template.totalDuration) * 100;
              const isActive = i === previewSlotIndex;
              return (
                <div
                  key={i}
                  className="relative flex items-center justify-center overflow-hidden transition-all duration-200"
                  style={{
                    width: `${widthPercent}%`,
                    minWidth: '16px',
                    background: isActive
                      ? `${template.color}22`
                      : 'rgba(255,255,255,0.03)',
                    borderBottom: isActive ? `2px solid ${template.color}` : '2px solid transparent',
                  }}
                  title={`Slot ${i + 1}: ${slot.duration}s | ${slot.transition} | ${slot.effect}`}
                >
                  <span className="text-[8px] font-mono text-white/60">{slot.duration}s</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

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
              placeholder="My Media Presentation"
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
            <button
              onClick={handleClientRender}
              disabled={isRendering || selectedMedia.length < 2 || !template}
              className="btn-gold inline-flex items-center gap-2"
              aria-label="Export video"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polygon points="5 3 19 12 5 21" />
              </svg>
              Export Video
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

// ====================================================================
//  Utility: resolution from aspect ratio + quality
// ====================================================================

function getResolution(aspect: string, quality: string): { width: number; height: number } {
  const q = quality === '4k' ? 2160 : quality === '1080p' ? 1080 : 720;
  switch (aspect) {
    case '9:16': return { width: Math.round(q * 9 / 16), height: q };
    case '1:1': return { width: q, height: q };
    default: return { width: Math.round(q * 16 / 9), height: q };
  }
}

// ====================================================================
//  Hold black frames for a given duration (seconds) — used for gaps
// ====================================================================

async function holdFrames(durationSeconds: number): Promise<void> {
  const fps = 30;
  const frames = Math.round(durationSeconds * fps);
  for (let f = 0; f < frames; f++) {
    if (f % 5 === 0) {
      await new Promise(r => requestAnimationFrame(r));
    }
  }
}

// ====================================================================
//  Load an image from a MediaFile (using thumbnailUrl for videos)
// ====================================================================

function loadMediaImage(media: MediaFile): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Failed to load media: ${media.name}`));
    // For video type, use thumbnailUrl if available; otherwise fall back to url
    img.src = media.type === 'video'
      ? (media.thumbnailUrl || media.url)
      : media.url;
  });
}

// ====================================================================
//  Compute focus point (normalized 0-1) based on holdPoint + face data
// ====================================================================

function getFocusPoint(
  media: MediaFile,
  holdPoint: TemplateSlot['holdPoint'],
): { fx: number; fy: number } {
  if (holdPoint === 'face' && media.faces.length > 0) {
    const face = media.faces[0];
    return {
      fx: (face.x + face.width / 2) / media.width,
      fy: (face.y + face.height / 2) / media.height,
    };
  }
  if (holdPoint === 'rule-of-thirds') {
    // Use left-third, upper-third intersection
    return { fx: 0.33, fy: 0.33 };
  }
  // center
  return { fx: 0.5, fy: 0.5 };
}

// ====================================================================
//  Draw a cover-fit image onto the canvas (with optional transform)
// ====================================================================

function drawCover(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  cw: number,
  ch: number,
): void {
  const scale = Math.max(cw / img.naturalWidth, ch / img.naturalHeight);
  const dw = img.naturalWidth * scale;
  const dh = img.naturalHeight * scale;
  ctx.drawImage(img, (cw - dw) / 2, (ch - dh) / 2, dw, dh);
}

// ====================================================================
//  renderSlotToCanvas — renders one slot's media with the slot's effect
// ====================================================================

async function renderSlotToCanvas(
  ctx: CanvasRenderingContext2D,
  media: MediaFile,
  width: number,
  height: number,
  slot: TemplateSlot,
): Promise<void> {
  const img = await loadMediaImage(media);
  const fps = 30;
  const frames = Math.round(slot.duration * fps);
  const { fx, fy } = getFocusPoint(media, slot.holdPoint);

  for (let frame = 0; frame < frames; frame++) {
    const t = frames > 1 ? frame / (frames - 1) : 0; // normalized 0..1

    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, width, height);
    ctx.save();

    // ---- Apply slot effect transform ----
    switch (slot.effect) {
      case 'ken-burns': {
        // Slow zoom centered on focus point (face or center)
        const zoom = 1 + t * 0.15;
        ctx.translate(width * 0.5, height * 0.5);
        ctx.scale(zoom, zoom);
        ctx.translate(-width * fx, -height * fy);
        break;
      }

      case 'slow-zoom': {
        // Gradual zoom from 1x to 1.15x centered
        const zoom = 1 + t * 0.15;
        ctx.translate(width * 0.5, height * 0.5);
        ctx.scale(zoom, zoom);
        ctx.translate(-width * 0.5, -height * 0.5);
        break;
      }

      case 'parallax': {
        // Horizontal pan offset simulating depth
        const offset = (t - 0.5) * 40;
        ctx.translate(offset, 0);
        break;
      }

      case 'pan-left': {
        // Translate image leftward over duration
        const panDistance = width * 0.08;
        ctx.translate(-panDistance * t, 0);
        break;
      }

      case 'pan-right': {
        // Translate image rightward over duration
        const panDistance = width * 0.08;
        ctx.translate(panDistance * t, 0);
        break;
      }

      case 'bounce': {
        // Slight bounce zoom using sine
        const zoom = 1.05 + Math.sin(t * Math.PI) * 0.05;
        ctx.translate(width * 0.5, height * 0.5);
        ctx.scale(zoom, zoom);
        ctx.translate(-width * 0.5, -height * 0.5);
        break;
      }

      case 'static':
      default:
        // No transform
        break;
    }

    drawCover(ctx, img, width, height);
    ctx.restore();

    // Yield to browser every 5 frames to prevent blocking
    if (frame % 5 === 0) {
      await new Promise(r => requestAnimationFrame(r));
    }
  }
}

// ====================================================================
//  renderTransition — draws a short transition between two slots
// ====================================================================

async function renderTransition(
  ctx: CanvasRenderingContext2D,
  fromMedia: MediaFile,
  toMedia: MediaFile,
  width: number,
  height: number,
  transition: TemplateSlot['transition'],
): Promise<void> {
  if (transition === 'none') return;

  const fromImg = await loadMediaImage(fromMedia);
  const toImg = await loadMediaImage(toMedia);

  const fps = 30;
  const transitionDuration = 0.4; // seconds
  const frames = Math.round(transitionDuration * fps);

  for (let frame = 0; frame < frames; frame++) {
    const t = frames > 1 ? frame / (frames - 1) : 1;

    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, width, height);

    switch (transition) {
      case 'fade': {
        // Draw outgoing, then overlay incoming with increasing opacity
        ctx.globalAlpha = 1 - t;
        drawCover(ctx, fromImg, width, height);
        ctx.globalAlpha = t;
        drawCover(ctx, toImg, width, height);
        ctx.globalAlpha = 1;
        break;
      }

      case 'slide-left': {
        // Outgoing slides left, incoming slides in from right
        const offset = t * width;
        ctx.save();
        ctx.translate(-offset, 0);
        drawCover(ctx, fromImg, width, height);
        ctx.restore();
        ctx.save();
        ctx.translate(width - offset, 0);
        drawCover(ctx, toImg, width, height);
        ctx.restore();
        break;
      }

      case 'slide-right': {
        const offset = t * width;
        ctx.save();
        ctx.translate(offset, 0);
        drawCover(ctx, fromImg, width, height);
        ctx.restore();
        ctx.save();
        ctx.translate(-width + offset, 0);
        drawCover(ctx, toImg, width, height);
        ctx.restore();
        break;
      }

      case 'zoom-in': {
        // Outgoing zooms in and fades, incoming fades in
        const zoom = 1 + t * 0.3;
        ctx.save();
        ctx.globalAlpha = 1 - t;
        ctx.translate(width * 0.5, height * 0.5);
        ctx.scale(zoom, zoom);
        ctx.translate(-width * 0.5, -height * 0.5);
        drawCover(ctx, fromImg, width, height);
        ctx.restore();
        ctx.save();
        ctx.globalAlpha = t;
        drawCover(ctx, toImg, width, height);
        ctx.restore();
        ctx.globalAlpha = 1;
        break;
      }

      case 'zoom-out': {
        // Outgoing shrinks, incoming fades in
        const zoom = 1 - t * 0.2;
        ctx.save();
        ctx.globalAlpha = 1 - t;
        ctx.translate(width * 0.5, height * 0.5);
        ctx.scale(zoom, zoom);
        ctx.translate(-width * 0.5, -height * 0.5);
        drawCover(ctx, fromImg, width, height);
        ctx.restore();
        ctx.save();
        ctx.globalAlpha = t;
        drawCover(ctx, toImg, width, height);
        ctx.restore();
        ctx.globalAlpha = 1;
        break;
      }

      case 'glitch': {
        // Rapid flicker between from and to with RGB offset
        const showTo = Math.random() < t;
        if (showTo) {
          drawCover(ctx, toImg, width, height);
        } else {
          drawCover(ctx, fromImg, width, height);
        }
        // RGB split effect during transition
        if (Math.random() < 0.4) {
          ctx.save();
          ctx.globalCompositeOperation = 'screen';
          ctx.globalAlpha = 0.15;
          ctx.translate(Math.random() * 8 - 4, 0);
          drawCover(ctx, showTo ? toImg : fromImg, width, height);
          ctx.restore();
        }
        break;
      }

      default: {
        // Fallback: simple crossfade
        ctx.globalAlpha = 1 - t;
        drawCover(ctx, fromImg, width, height);
        ctx.globalAlpha = t;
        drawCover(ctx, toImg, width, height);
        ctx.globalAlpha = 1;
        break;
      }
    }

    if (frame % 3 === 0) {
      await new Promise(r => requestAnimationFrame(r));
    }
  }
}
