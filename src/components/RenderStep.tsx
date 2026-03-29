'use client';

import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { MediaFile, MusicTrack, RenderProgress, SmartTemplate, TemplateSlot, TemplateTheme, TextOverlay } from '@/types';
import { SMART_TEMPLATES, assignMediaToSlots, formatDuration } from '@/lib/templates';
import { createParticles, updateParticles, drawParticles, drawVignette, drawTintOverlay, getParticleCSS, Particle } from '@/lib/particles';
import { drawTextOverlay } from '@/lib/text-renderer';
import { EffectsEngine, templateSlotToEngineSlot, type SlotConfig } from '@/lib/effects-engine';
import type { MixerOverrides } from '@/components/TemplateMixer';

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
  textOverrides?: Record<number, string | null>;
  mixerOverrides?: MixerOverrides;
}

export default function RenderStep(props: RenderStepProps) {
  const {
    photos,
    selectedTemplate,
    music,
    title,
    onTitleChange,
    aspectRatio,
    outputQuality,
    onQualityChange,
    onBack,
  } = props;
  const textOverrides = props.textOverrides ?? {};
  const mixerOverrides = props.mixerOverrides ?? {};
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
  const previewCanvasRef = useRef<HTMLCanvasElement>(null);
  const previewEngineRef = useRef<EffectsEngine | null>(null);
  const previewAnimRef = useRef<number>(0);
  const previewImagesRef = useRef<Map<string, HTMLImageElement>>(new Map());

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
  //  Animated Canvas Preview using v4 EffectsEngine
  // ------------------------------------------------------------------
  useEffect(() => {
    if (!template || selectedMedia.length === 0) return;

    const canvas = previewCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Resize canvas to match its display size
    const rect = canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.round(rect.width * dpr);
    const h = Math.round(rect.height * dpr);
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }

    // Create or resize engine
    if (!previewEngineRef.current || previewEngineRef.current['width'] !== w) {
      previewEngineRef.current = new EffectsEngine(w, h);
    }
    const engine = previewEngineRef.current;

    // Build slot configs (with mixer overrides applied)
    const slotConfigs: SlotConfig[] = template.slots.map((slot, i) => {
      const mixed = applyMixerOverrides(slot, mixerOverrides);
      const mid = slotAssignments[i] || '';
      const media = mediaById.get(mid);
      const { fx, fy } = media
        ? getFocusPoint(media, slot.holdPoint)
        : { fx: 0.5, fy: 0.5 };
      return templateSlotToEngineSlot(mixed, fx, fy);
    });

    // Load images for all slots
    const imageMap = new Map<number, CanvasImageSource>();
    let imagesLoaded = 0;
    const totalImages = template.slots.length;

    const tryStartAnimation = () => {
      if (imagesLoaded < Math.min(totalImages, 1)) return; // Wait for at least first image

      const totalDuration = template.totalDuration;
      let startTime = performance.now();
      let running = true;

      const animate = (now: number) => {
        if (!running) return;
        const elapsed = (now - startTime) / 1000;
        const globalTime = elapsed % totalDuration; // Loop

        const frame = engine.calculateFrame(globalTime, slotConfigs);

        // Update slot index for UI indicators
        if (frame.slotIndex !== previewSlotIndex) {
          setPreviewSlotIndex(frame.slotIndex);
        }

        // Render using the engine
        if (imageMap.has(frame.slotIndex) || (frame.inTransition && imageMap.has(frame.transitionDstSlot))) {
          engine.renderFrame(ctx, frame, slotConfigs, imageMap);

          // Draw theme overlays on top
          if (template.theme.tintOverlay) {
            drawTintOverlay(ctx, w, h, template.theme.tintOverlay);
          }
          if (template.theme.vignette > 0) {
            drawVignette(ctx, w, h, template.theme.vignette);
          }
        }

        previewAnimRef.current = requestAnimationFrame(animate);
      };

      previewAnimRef.current = requestAnimationFrame(animate);

      return () => {
        running = false;
        cancelAnimationFrame(previewAnimRef.current);
      };
    };

    let cleanupAnim: (() => void) | undefined;

    // Load images
    template.slots.forEach((_, i) => {
      const mid = slotAssignments[i] || '';
      const media = mediaById.get(mid);
      if (!media) {
        imagesLoaded++;
        return;
      }

      const cached = previewImagesRef.current.get(media.url);
      if (cached && cached.complete) {
        imageMap.set(i, cached);
        imagesLoaded++;
        if (imagesLoaded >= 1 && !cleanupAnim) {
          cleanupAnim = tryStartAnimation();
        }
        return;
      }

      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        previewImagesRef.current.set(media.url, img);
        imageMap.set(i, img);
        imagesLoaded++;
        if (imagesLoaded >= 1 && !cleanupAnim) {
          cleanupAnim = tryStartAnimation();
        }
      };
      img.onerror = () => {
        imagesLoaded++;
        if (imagesLoaded >= 1 && !cleanupAnim) {
          cleanupAnim = tryStartAnimation();
        }
      };
      img.src = media.type === 'video'
        ? (media.thumbnailUrl || media.url)
        : media.url;
    });

    return () => {
      if (cleanupAnim) cleanupAnim();
      cancelAnimationFrame(previewAnimRef.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [template?.id, selectedMedia.length, slotAssignments.join(','), JSON.stringify(mixerOverrides)]);

  const currentSlot = template?.slots[previewSlotIndex] ?? null;
  const currentMedia = mediaById.get(slotAssignments[previewSlotIndex] || '');

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

      // Create the v4 effects engine for this render
      const engine = new EffectsEngine(dims.width, dims.height);

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

      // Render each slot with its assigned media (mixer overrides applied)
      for (let i = 0; i < template.slots.length; i++) {
        const slot = applyMixerOverrides(template.slots[i], mixerOverrides);
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
            template.theme,
            textOverrides,
            i,
            engine,
          );
        } else {
          // Empty slot — hold black for slot duration
          ctx.fillStyle = '#000';
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          await holdFrames(slot.duration);
        }

        // Render inter-slot transition if not the last slot
        if (i < template.slots.length - 1) {
          const nextSlot = applyMixerOverrides(template.slots[i + 1], mixerOverrides);
          const nextMediaId = slotAssignments[i + 1] || '';
          const nextMedia = mediaById.get(nextMediaId);
          if (assignedMedia && nextMedia) {
            await renderTransition(
              ctx,
              assignedMedia,
              nextMedia,
              canvas.width,
              canvas.height,
              slot,
              nextSlot,
              engine,
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
  }, [template, slotAssignments, selectedMedia, mediaById, aspectRatio, outputQuality, music, textOverrides, mixerOverrides]);

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
          {selectedMedia.length > 0 && template ? (
            <canvas
              ref={previewCanvasRef}
              className="absolute inset-0 w-full h-full"
              style={{ imageRendering: 'auto' }}
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

          {/* Particle preview */}
          {template && template.theme.particles !== 'none' && (
            <div
              className="absolute inset-0 pointer-events-none"
              style={{
                backgroundImage: getParticleCSS(template.theme.particles, template.theme.particleDensity),
              }}
            />
          )}

          {/* Tint overlay */}
          {template?.theme.tintOverlay && (
            <div
              className="absolute inset-0 pointer-events-none"
              style={{ background: template.theme.tintOverlay }}
            />
          )}

          {/* Text preview (static) */}
          {currentSlot?.textOverlay && textOverrides[previewSlotIndex] !== null && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <p
                className="font-bold text-center px-4"
                style={{
                  color: currentSlot.textOverlay.color,
                  fontSize: currentSlot.textOverlay.fontSize === 'xl' ? '2rem'
                    : currentSlot.textOverlay.fontSize === 'lg' ? '1.5rem'
                    : currentSlot.textOverlay.fontSize === 'md' ? '1rem'
                    : '0.75rem',
                  textShadow: currentSlot.textOverlay.glowColor
                    ? `0 0 15px ${currentSlot.textOverlay.glowColor}`
                    : '0 2px 8px rgba(0,0,0,0.8)',
                  position: 'absolute',
                  top: currentSlot.textOverlay.position === 'top' ? '15%'
                    : currentSlot.textOverlay.position === 'bottom' ? '85%'
                    : '50%',
                  left: '50%',
                  transform: 'translate(-50%, -50%)',
                }}
              >
                {typeof textOverrides[previewSlotIndex] === 'string'
                  ? textOverrides[previewSlotIndex]
                  : currentSlot.textOverlay.text}
              </p>
            </div>
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

// ====================================================================
//  Apply mixer overrides to a template slot
// ====================================================================

function applyMixerOverrides(slot: TemplateSlot, overrides: MixerOverrides): TemplateSlot {
  const modified = { ...slot };

  if (overrides.motion) {
    modified.effect = overrides.motion;
  }
  if (overrides.transition) {
    modified.transition = overrides.transition;
  }
  if (overrides.motionIntensity !== undefined) {
    modified.motionIntensity = overrides.motionIntensity;
  }
  if (overrides.speedPreset) {
    modified.speedPreset = overrides.speedPreset;
  }
  if (overrides.colorGrade || overrides.postEffects) {
    const existingEffects = [...(modified.postEffects || [])];

    // Replace/add color grade
    if (overrides.colorGrade) {
      const idx = existingEffects.findIndex(e => e.effect === 'colorGrade');
      const gradeEffect = { effect: 'colorGrade', intensity: 0.7, params: { preset: overrides.colorGrade } };
      if (idx >= 0) {
        existingEffects[idx] = gradeEffect;
      } else {
        existingEffects.unshift(gradeEffect);
      }
    }

    // Add mixer post-effects
    if (overrides.postEffects) {
      for (const fx of overrides.postEffects) {
        const idx = existingEffects.findIndex(e => e.effect === fx.effect);
        if (idx >= 0) {
          existingEffects[idx] = fx;
        } else {
          existingEffects.push(fx);
        }
      }
    }

    modified.postEffects = existingEffects;
  }

  return modified;
}

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
//  renderSlotToCanvas — renders one slot using the v4 EffectsEngine
// ====================================================================

async function renderSlotToCanvas(
  ctx: CanvasRenderingContext2D,
  media: MediaFile,
  width: number,
  height: number,
  slot: TemplateSlot,
  theme: TemplateTheme,
  textOverrides: Record<number, string | null>,
  slotIndex: number,
  engine: EffectsEngine,
): Promise<void> {
  const img = await loadMediaImage(media);
  const fps = 30;
  const frames = Math.round(slot.duration * fps);
  const { fx, fy } = getFocusPoint(media, slot.holdPoint);

  // Convert template slot to engine slot config
  const slotConfig = templateSlotToEngineSlot(slot, fx, fy);

  // Create slot array + image map for the engine
  const slotConfigs: SlotConfig[] = [slotConfig];
  const imageMap = new Map<number, CanvasImageSource>();
  imageMap.set(0, img);

  // Initialize particles for this slot
  let particles: Particle[] = [];
  if (theme.particles !== 'none') {
    const particleCount = Math.round(80 * theme.particleDensity);
    particles = createParticles(theme.particles, particleCount, width, height);
  }

  for (let frame = 0; frame < frames; frame++) {
    const t = frames > 1 ? frame / (frames - 1) : 0;
    const globalTime = t * slotConfig.duration;

    // Use the v4 engine for motion + post-processing
    const engineFrame = engine.calculateFrame(globalTime, slotConfigs);
    engine.renderFrame(ctx, engineFrame, slotConfigs, imageMap);

    // --- Theme overlays (on top of engine output) ---

    // CSS filter overlay via tint
    if (theme.tintOverlay) {
      drawTintOverlay(ctx, width, height, theme.tintOverlay);
    }

    // Theme-level vignette (engine may also add slot-level vignette)
    if (theme.vignette > 0) {
      drawVignette(ctx, width, height, theme.vignette);
    }

    // Particles
    if (theme.particles !== 'none' && particles.length > 0) {
      drawParticles(ctx, particles, width, height);
      particles = updateParticles(particles, 1 / fps, width, height);
    }

    // Text overlay
    if (slot.textOverlay && textOverrides[slotIndex] !== null) {
      const overlay = { ...slot.textOverlay };
      if (typeof textOverrides[slotIndex] === 'string') {
        overlay.text = textOverrides[slotIndex] as string;
      }
      drawTextOverlay(ctx, overlay, width, height, t);
    }

    // Yield to browser every 5 frames to prevent blocking
    if (frame % 5 === 0) {
      await new Promise(r => requestAnimationFrame(r));
    }
  }
}

// ====================================================================
//  renderTransition — draws transition between two slots using v4 engine
// ====================================================================

async function renderTransition(
  ctx: CanvasRenderingContext2D,
  fromMedia: MediaFile,
  toMedia: MediaFile,
  width: number,
  height: number,
  fromSlot: TemplateSlot,
  toSlot: TemplateSlot,
  engine: EffectsEngine,
): Promise<void> {
  if (toSlot.transition === 'none') return;

  const fromImg = await loadMediaImage(fromMedia);
  const toImg = await loadMediaImage(toMedia);

  const { fx: fxFrom, fy: fyFrom } = getFocusPoint(fromMedia, fromSlot.holdPoint);
  const { fx: fxTo, fy: fyTo } = getFocusPoint(toMedia, toSlot.holdPoint);

  const fromConfig = templateSlotToEngineSlot(fromSlot, fxFrom, fyFrom);
  const toConfig = templateSlotToEngineSlot(toSlot, fxTo, fyTo);

  const fps = 30;
  const transDuration = toSlot.transitionDuration ?? 0.4;
  const frames = Math.round(transDuration * fps);

  // Build a two-slot config to let the engine handle the transition
  const slotConfigs: SlotConfig[] = [fromConfig, toConfig];
  const imageMap = new Map<number, CanvasImageSource>();
  imageMap.set(0, fromImg);
  imageMap.set(1, toImg);

  for (let frame = 0; frame < frames; frame++) {
    const t = frames > 1 ? frame / (frames - 1) : 1;

    // Position the global time within the transition zone (end of slot 0)
    const transStart = fromConfig.duration - transDuration;
    const globalTime = transStart + t * transDuration;

    const engineFrame = engine.calculateFrame(globalTime, slotConfigs);
    engine.renderFrame(ctx, engineFrame, slotConfigs, imageMap);

    if (frame % 3 === 0) {
      await new Promise(r => requestAnimationFrame(r));
    }
  }
}
