'use client';

import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { MediaFile, MusicTrack, RenderProgress, SmartTemplate, TemplateSlot, TemplateTheme, TextOverlay, TextOverlayOverride } from '@/types';
import { SMART_TEMPLATES, assignMediaToSlots, expandTemplateForMedia, formatDuration, getSlotMediaIds, applyBeatSync } from '@/lib/templates';
import { detectBeats, quantizeSlotsToBeat, getStrongBeats } from '@/lib/beat-detect';
import { createParticles, updateParticles, drawParticles, drawVignette, drawTintOverlay, getParticleCSS, Particle } from '@/lib/particles';
import { drawTextOverlay, resolveTextOverlay } from '@/lib/text-renderer';
import { EffectsEngine, templateSlotToEngineSlot, type SlotConfig } from '@/lib/effects-engine';
import { initFFmpeg, writeFrame, writeAudio, mixAudioTracks, encodeMP4, cleanupFS } from '@/lib/mp4-encoder';
import { getVideoElement, seekToTime, getVideoTime, loadMediaSource, disposeAllVideos } from '@/lib/video-frame-extractor';
import { renderSplitScreen, getLayoutMediaCount } from '@/lib/split-screen';
import { renderTransitionOverlay } from '@/lib/transition-overlays';
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
  textOverrides?: Record<number, TextOverlayOverride>;
  mixerOverrides?: MixerOverrides;
  /** Called when export completes successfully — used for auto-saving project */
  onExportComplete?: () => void;
  /** Full playlist of music tracks for export (played in sequence) */
  musicTracks?: MusicTrack[];
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
    onExportComplete,
    musicTracks = [],
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
  const mediaByIdRef = useRef<Map<string, MediaFile>>(new Map());
  const previewImagesRef = useRef<Map<string, HTMLImageElement>>(new Map());
  const previewAudioRef = useRef<HTMLAudioElement | null>(null);
  const [audioPlaying, setAudioPlaying] = useState(false);
  const hasUserInteracted = useRef(false);

  const selectedMedia = useMemo(() => photos.filter(p => p.selected), [photos]);
  const baseTemplate = SMART_TEMPLATES.find(t => t.id === selectedTemplate) || null;

  // Beat detection state
  const [beatInfo, setBeatInfo] = useState<{ beats: number[]; bpm: number; duration: number } | null>(null);

  // Detect beats when music changes
  useEffect(() => {
    if (!music?.url) {
      setBeatInfo(null);
      return;
    }
    let cancelled = false;
    const source = music.file || music.url;
    detectBeats(source, 0.6).then((info) => {
      if (!cancelled) {
        setBeatInfo(info);
        console.log(`[BeatSync] Detected ${info.beats.length} beats, ~${info.bpm} BPM`);
      }
    }).catch((err) => {
      if (!cancelled) {
        console.warn('[BeatSync] Beat detection failed:', err);
        setBeatInfo(null);
      }
    });
    return () => { cancelled = true; };
  }, [music?.url, music?.file]);

  // Expand template to fit all selected media (e.g., 60 photos → 60 slots)
  const expandedTemplate = useMemo(() => {
    if (!baseTemplate) return null;
    const targetDuration = music?.duration && music.duration > 0 ? music.duration : undefined;
    return expandTemplateForMedia(baseTemplate, selectedMedia.length, targetDuration);
  }, [baseTemplate, selectedMedia.length, music?.duration]);

  // Apply beat sync to the expanded template (if beats detected)
  const template = useMemo(() => {
    if (!expandedTemplate) return null;
    if (!beatInfo || beatInfo.beats.length < 4) return expandedTemplate;

    // Use strong beats for slot transitions
    const strongBeats = getStrongBeats(beatInfo.beats, beatInfo.bpm);
    const beatDurations = quantizeSlotsToBeat(
      expandedTemplate.slots.length,
      strongBeats,
      beatInfo.duration,
    );

    return applyBeatSync(expandedTemplate, beatDurations);
  }, [expandedTemplate, beatInfo]);

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

  // Keep ref in sync so animation loop always reads latest trim values
  useEffect(() => {
    mediaByIdRef.current = mediaById;
  }, [mediaById]);

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

        // For video-type media, update the video element's currentTime
        // so the engine draws the correct frame (uses ref for latest trim values)
        const updateVideoTime = (slotIdx: number, progress: number) => {
          const mid = slotAssignments[slotIdx] || '';
          const media = mediaByIdRef.current.get(mid);
          if (media?.type === 'video') {
            const source = imageMap.get(slotIdx);
            if (source && source instanceof HTMLVideoElement) {
              const targetTime = getVideoTime(progress, media);
              // Only seek if we've moved significantly (avoid micro-seeks)
              if (Math.abs(source.currentTime - targetTime) > 0.05) {
                source.currentTime = targetTime;
              }
            }
          }
        };

        updateVideoTime(frame.slotIndex, frame.slotProgress);
        if (frame.inTransition) {
          updateVideoTime(frame.transitionDstSlot, 0);
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

          // Fade-out on last slot
          const fadeOutDur = template.fadeOutDuration ?? 0;
          if (fadeOutDur > 0) {
            const timeRemaining = totalDuration - globalTime;
            if (timeRemaining <= fadeOutDur) {
              const fadeAlpha = 1 - (timeRemaining / fadeOutDur);
              ctx.fillStyle = `rgba(0, 0, 0, ${Math.min(1, Math.max(0, fadeAlpha))})`;
              ctx.fillRect(0, 0, w, h);
            }
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

    // Start audio playback for preview
    if (music?.url) {
      try {
        // Clean up any previous audio
        if (previewAudioRef.current) {
          previewAudioRef.current.pause();
          previewAudioRef.current = null;
          setAudioPlaying(false);
        }
        const audio = new Audio();
        audio.crossOrigin = 'anonymous';
        audio.loop = true;
        audio.volume = 0.6;
        audio.preload = 'auto';

        // Set up event listeners before setting src
        audio.addEventListener('canplaythrough', () => {
          // Try auto-play (works if user has already interacted with the page)
          audio.play()
            .then(() => setAudioPlaying(true))
            .catch(() => {
              // Browser blocked autoplay — that's fine, user can click play
              console.log('[Audio] Autoplay blocked, waiting for user interaction');
            });
        }, { once: true });

        audio.addEventListener('error', (e) => {
          console.warn('[Audio] Failed to load audio:', e);
        });

        // If music has a File object, create a fresh blob URL from it for reliability
        if (music.file) {
          const freshUrl = URL.createObjectURL(music.file);
          audio.src = freshUrl;
          // Clean up this URL when audio is done
          audio.addEventListener('emptied', () => URL.revokeObjectURL(freshUrl), { once: true });
        } else {
          audio.src = music.url;
        }

        previewAudioRef.current = audio;
      } catch (err) {
        console.warn('[Audio] Setup failed:', err);
      }
    }

    // Load images (and video elements for video-type media)
    template.slots.forEach((slot, i) => {
      const layout = slot.layout ?? 'single';

      // Split-screen layouts: composite multiple images into one canvas
      if (layout !== 'single') {
        const slotMediaIds = getSlotMediaIds(i, template, slotAssignments, mediaIds);
        const slotMedia = slotMediaIds
          .map(id => mediaById.get(id))
          .filter((m): m is MediaFile => !!m);

        if (slotMedia.length === 0) {
          imagesLoaded++;
          return;
        }

        loadSplitScreenComposite(slotMedia, layout, w, h).then((composite) => {
          imageMap.set(i, composite);
          imagesLoaded++;
          if (imagesLoaded >= 1 && !cleanupAnim) {
            cleanupAnim = tryStartAnimation();
          }
        }).catch(() => {
          imagesLoaded++;
          if (imagesLoaded >= 1 && !cleanupAnim) {
            cleanupAnim = tryStartAnimation();
          }
        });
        return;
      }

      // Single layout — existing behavior
      const mid = slotAssignments[i] || '';
      const media = mediaById.get(mid);
      if (!media) {
        imagesLoaded++;
        return;
      }

      if (media.type === 'video') {
        // Load real video element for video-type media
        getVideoElement(media).then((video) => {
          // Seek to trim start
          const startTime = media.trimStart ?? 0;
          seekToTime(video, startTime).then(() => {
            imageMap.set(i, video);
            imagesLoaded++;
            if (imagesLoaded >= 1 && !cleanupAnim) {
              cleanupAnim = tryStartAnimation();
            }
          });
        }).catch(() => {
          // Fallback: try loading as image (thumbnail)
          const img = new Image();
          img.crossOrigin = 'anonymous';
          img.onload = () => {
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
          img.src = media.thumbnailUrl || media.url;
        });
        return;
      }

      // Photo — standard image loading
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
      img.src = media.url;
    });

    return () => {
      if (cleanupAnim) cleanupAnim();
      cancelAnimationFrame(previewAnimRef.current);
      if (previewAudioRef.current) {
        previewAudioRef.current.pause();
        previewAudioRef.current.src = '';
        previewAudioRef.current = null;
        setAudioPlaying(false);
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [template?.id, selectedMedia.length, slotAssignments.join(','), JSON.stringify(mixerOverrides), music?.url]);

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
  //  Client-side canvas render → MP4 via ffmpeg.wasm
  // ------------------------------------------------------------------
  const handleClientRender = useCallback(async () => {
    if (!template) return;

    const FPS = 30;

    setProgress({ status: 'preparing', percent: 2, currentFrame: 0, totalFrames: template.slots.length, message: 'Loading video encoder...' });

    try {
      // 1. Load ffmpeg.wasm (cached after first load)
      const ffmpeg = await initFFmpeg((msg) => {
        setProgress(prev => ({ ...prev, message: msg }));
      });

      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Canvas not supported');

      const dims = getResolution(aspectRatio, outputQuality);
      canvas.width = dims.width;
      canvas.height = dims.height;

      // Create the v4 effects engine for this render
      const engine = new EffectsEngine(dims.width, dims.height);

      setProgress({ status: 'rendering', percent: 5, currentFrame: 0, totalFrames: template.slots.length, message: 'Rendering frames...' });

      // 2. Render frames and write each to ffmpeg virtual FS
      let globalFrameNumber = 0;

      for (let i = 0; i < template.slots.length; i++) {
        const slot = applyMixerOverrides(template.slots[i], mixerOverrides);
        const assignedMediaId = slotAssignments[i] || '';
        const assignedMedia = mediaById.get(assignedMediaId);

        setProgress(prev => ({
          ...prev,
          status: 'rendering',
          percent: 5 + Math.round((i / template.slots.length) * 55),
          currentFrame: i + 1,
          message: `Rendering slot ${i + 1} of ${template.slots.length}...`,
        }));

        const slotLayout = slot.layout ?? 'single';

        if (slotLayout !== 'single') {
          // Split-screen slot: composite multiple images, render through engine
          const slotMediaIds = getSlotMediaIds(i, template, slotAssignments, mediaIds);
          const slotMedia = slotMediaIds
            .map(id => mediaById.get(id))
            .filter((m): m is MediaFile => !!m);

          if (slotMedia.length > 0) {
            const composite = await loadSplitScreenComposite(
              slotMedia, slotLayout, canvas.width, canvas.height,
            );
            // Create a temporary MediaFile-like wrapper for the composite
            const compositeMedia: MediaFile = {
              ...slotMedia[0],
              type: 'photo', // Treat composite as a photo
            };
            // Use the composite as the source for the effects engine
            globalFrameNumber = await renderSlotFramesToFFmpegWithSource(
              ctx, canvas, ffmpeg, composite, compositeMedia,
              canvas.width, canvas.height, slot, template.theme,
              textOverrides, i, engine, globalFrameNumber, FPS,
            );
          } else {
            // No media — black frames
            const frames = Math.round(slot.duration * FPS);
            for (let f = 0; f < frames; f++) {
              ctx.fillStyle = '#000';
              ctx.fillRect(0, 0, canvas.width, canvas.height);
              await writeFrame(ffmpeg, canvas, globalFrameNumber);
              globalFrameNumber++;
              if (f % 10 === 0) await new Promise(r => setTimeout(r, 0));
            }
          }
        } else if (assignedMedia) {
          // Single layout — render slot frames via effects engine
          globalFrameNumber = await renderSlotFramesToFFmpeg(
            ctx,
            canvas,
            ffmpeg,
            assignedMedia,
            canvas.width,
            canvas.height,
            slot,
            template.theme,
            textOverrides,
            i,
            engine,
            globalFrameNumber,
            FPS,
          );
        } else {
          // Empty slot — hold black frames
          const frames = Math.round(slot.duration * FPS);
          for (let f = 0; f < frames; f++) {
            ctx.fillStyle = '#000';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            await writeFrame(ffmpeg, canvas, globalFrameNumber);
            globalFrameNumber++;
            if (f % 10 === 0) await new Promise(r => setTimeout(r, 0));
          }
        }

        // Render inter-slot transition
        if (i < template.slots.length - 1) {
          const nextSlot = applyMixerOverrides(template.slots[i + 1], mixerOverrides);
          const nextMediaId = slotAssignments[i + 1] || '';
          const nextMedia = mediaById.get(nextMediaId);
          if (assignedMedia && nextMedia) {
            globalFrameNumber = await renderTransitionFramesToFFmpeg(
              ctx,
              canvas,
              ffmpeg,
              assignedMedia,
              nextMedia,
              canvas.width,
              canvas.height,
              slot,
              nextSlot,
              engine,
              globalFrameNumber,
              FPS,
            );
          }
        }
      }

      // Render fade-out at the end (re-render last frame with increasing black overlay)
      const fadeOutDur = template.fadeOutDuration ?? 0;
      if (fadeOutDur > 0) {
        const fadeFrames = Math.round(fadeOutDur * FPS);
        setProgress(prev => ({ ...prev, message: 'Rendering fade-out...' }));

        // Get last slot info for re-rendering the final frame with fade
        const lastSlotIndex = template.slots.length - 1;
        const lastSlot = applyMixerOverrides(template.slots[lastSlotIndex], mixerOverrides);
        const lastMediaId = slotAssignments[lastSlotIndex] || '';
        const lastMedia = mediaById.get(lastMediaId);

        if (lastMedia) {
          const lastSource = await loadMediaImage(lastMedia);
          const isVideo = lastMedia.type === 'video' && lastSource instanceof HTMLVideoElement;
          const { fx, fy } = getFocusPoint(lastMedia, lastSlot.holdPoint);
          const lastSlotConfig = templateSlotToEngineSlot(lastSlot, fx, fy);
          const lastSlotConfigs: SlotConfig[] = [lastSlotConfig];
          const lastImageMap = new Map<number, CanvasImageSource>();
          lastImageMap.set(0, lastSource);

          for (let f = 0; f < fadeFrames; f++) {
            const fadeProgress = f / fadeFrames;

            // Hold on the last frame of the slot
            if (isVideo) {
              const videoTime = getVideoTime(1, lastMedia);
              await seekToTime(lastSource as HTMLVideoElement, videoTime);
            }

            const engineFrame = engine.calculateFrame(lastSlotConfig.duration * 0.99, lastSlotConfigs);
            engine.renderFrame(ctx, engineFrame, lastSlotConfigs, lastImageMap);

            // Apply progressive black overlay
            ctx.fillStyle = `rgba(0, 0, 0, ${fadeProgress})`;
            ctx.fillRect(0, 0, canvas.width, canvas.height);

            await writeFrame(ffmpeg, canvas, globalFrameNumber);
            globalFrameNumber++;

            if (f % 5 === 0) await new Promise(r => setTimeout(r, 0));
          }
        } else {
          // No media for last slot — just fade black frames
          for (let f = 0; f < fadeFrames; f++) {
            ctx.fillStyle = '#000';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            await writeFrame(ffmpeg, canvas, globalFrameNumber);
            globalFrameNumber++;
          }
        }
      }

      const totalFrames = globalFrameNumber;

      // 3. Mix and write audio (if any)
      setProgress(prev => ({ ...prev, percent: 62, message: 'Processing audio...' }));
      const tracksToUse = musicTracks.length > 0 ? musicTracks : (music ? [music] : []);
      let hasAudio = false;

      if (tracksToUse.length > 0) {
        const audioBlob = await mixAudioTracks(
          tracksToUse.map(t => ({ url: t.url, file: t.file })),
          template.totalDuration,
        );
        if (audioBlob) {
          await writeAudio(ffmpeg, audioBlob, 'audio.wav');
          hasAudio = true;
        }
      }

      // 4. Encode MP4 with ffmpeg
      setProgress(prev => ({
        ...prev,
        status: 'encoding',
        percent: 65,
        message: 'Encoding MP4...',
      }));

      const mp4Blob = await encodeMP4(ffmpeg, FPS, totalFrames, hasAudio, (pct) => {
        setProgress(prev => ({
          ...prev,
          percent: 65 + Math.round(pct * 0.30), // 65-95%
          message: `Encoding MP4... ${pct}%`,
        }));
      });

      // 5. Clean up virtual FS
      setProgress(prev => ({ ...prev, percent: 96, message: 'Cleaning up...' }));
      await cleanupFS(ffmpeg, totalFrames);

      // 6. Create download URL
      const url = URL.createObjectURL(mp4Blob);

      setProgress({
        status: 'complete',
        percent: 100,
        currentFrame: template.slots.length,
        totalFrames: template.slots.length,
        message: 'Export complete!',
        outputUrl: url,
      });

      // Auto-save project on successful export
      if (onExportComplete) {
        try {
          onExportComplete();
        } catch {
          // Don't let project save failure affect export success
        }
      }
    } catch (e) {
      console.error('[Export] MP4 render failed:', e);
      setProgress({
        status: 'error',
        percent: 0,
        currentFrame: 0,
        totalFrames: 0,
        message: '',
        error: e instanceof Error ? e.message : 'MP4 export failed',
      });
    }
  }, [template, slotAssignments, selectedMedia, mediaById, aspectRatio, outputQuality, music, textOverrides, mixerOverrides, musicTracks, onExportComplete]);

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
              className="absolute inset-0 w-full h-full cursor-pointer"
              style={{ imageRendering: 'auto' }}
              onClick={() => {
                // Start audio on first canvas click (satisfies browser autoplay policy)
                if (!hasUserInteracted.current) {
                  hasUserInteracted.current = true;
                  const audio = previewAudioRef.current;
                  if (audio && !audioPlaying) {
                    audio.play().then(() => setAudioPlaying(true)).catch(() => {});
                  }
                }
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

          {/* Audio controls — prominent bar at bottom of preview */}
          {music && (
            <div className="absolute bottom-[60px] left-3 right-3 z-10 flex items-center gap-2">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  hasUserInteracted.current = true;
                  const audio = previewAudioRef.current;
                  if (!audio) return;
                  if (audioPlaying) {
                    audio.pause();
                    setAudioPlaying(false);
                  } else {
                    audio.play().then(() => setAudioPlaying(true)).catch((err) => {
                      console.warn('[Audio] Play failed:', err);
                    });
                  }
                }}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-full backdrop-blur-md border transition-all ${
                  audioPlaying
                    ? 'bg-accent-gold/20 border-accent-gold/40 text-accent-gold'
                    : 'bg-black/60 border-white/20 text-white hover:bg-black/80 hover:border-accent-gold/40 animate-pulse'
                }`}
                aria-label={audioPlaying ? 'Pause music' : 'Play music'}
              >
                {audioPlaying ? (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                    <rect x="6" y="4" width="4" height="16" rx="1" />
                    <rect x="14" y="4" width="4" height="16" rx="1" />
                  </svg>
                ) : (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M9 18V5l12 7z" />
                  </svg>
                )}
                <span className="text-[10px] font-bold">
                  {audioPlaying ? '♫ Playing' : '♫ Play Music'}
                </span>
              </button>
              {audioPlaying && (
                <div className="flex-1 flex items-center gap-1">
                  {[...Array(12)].map((_, i) => (
                    <div
                      key={i}
                      className="flex-1 h-3 bg-accent-gold/40 rounded-full"
                      style={{
                        animation: `audioBar 0.8s ease-in-out ${i * 0.1}s infinite alternate`,
                        height: `${4 + Math.random() * 8}px`,
                      }}
                    />
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Overlay info */}
          <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/80 to-transparent p-4">
            <div className="flex items-end justify-between">
              <div>
                <p className="text-xs text-accent-gold font-mono">{template?.name || 'No template'}</p>
                <p className="text-[10px] text-text-muted">
                  {selectedMedia.length} media &bull; {template ? formatDuration(template.totalDuration) : '0s'}
                  {music ? ` \u2022 \u266B ${music.name}` : ' \u2022 No music'}
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
          {(() => {
            const override = textOverrides[previewSlotIndex];
            let resolved: TextOverlay | null = null;
            if (currentSlot?.textOverlay) {
              resolved = resolveTextOverlay(currentSlot.textOverlay, override);
            } else if (override && typeof override === 'object' && override !== null) {
              const defaults: TextOverlay = {
                text: 'Your Text', position: 'center', fontSize: 'lg',
                fontWeight: 'bold', animation: 'fade-in', color: '#ffffff',
              };
              resolved = { ...defaults, ...override } as TextOverlay;
            }
            if (!resolved) return null;
            return (
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <p
                  className="text-center px-6 max-w-[90%] leading-tight"
                  style={{
                    color: resolved.color,
                    fontSize: resolved.fontSize === 'xl' ? 'clamp(1.8rem, 5vw, 3.5rem)'
                      : resolved.fontSize === 'lg' ? 'clamp(1.4rem, 4vw, 2.5rem)'
                      : resolved.fontSize === 'md' ? 'clamp(1rem, 3vw, 1.8rem)'
                      : 'clamp(0.8rem, 2vw, 1.2rem)',
                    fontWeight: resolved.fontWeight === 'black' ? 900
                      : resolved.fontWeight === 'bold' ? 700 : 400,
                    textShadow: resolved.glowColor
                      ? `0 0 20px ${resolved.glowColor}, 0 0 40px ${resolved.glowColor}, 0 2px 10px rgba(0,0,0,0.8)`
                      : '0 2px 4px rgba(0,0,0,0.9), 0 4px 12px rgba(0,0,0,0.6)',
                    position: 'absolute',
                    top: resolved.position === 'top' ? '15%'
                      : resolved.position === 'bottom' ? '80%'
                      : '50%',
                    left: '50%',
                    transform: 'translate(-50%, -50%)',
                    letterSpacing: resolved.fontWeight === 'black' ? '0.05em' : '0.02em',
                    textTransform: resolved.fontWeight === 'black' ? 'uppercase' as const : 'none' as const,
                  }}
                >
                  {resolved.text}
                </p>
              </div>
            );
          })()}
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
                  download={`${title || 'photoforge-export'}.mp4`}
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

function loadMediaImage(media: MediaFile): Promise<CanvasImageSource> {
  if (media.type === 'video') {
    // Return a video element seeked to trim start for real frame rendering
    return getVideoElement(media).then(async (video) => {
      const startTime = media.trimStart ?? 0;
      await seekToTime(video, startTime);
      return video as CanvasImageSource;
    }).catch(() => {
      // Fallback to thumbnail image if video loading fails
      return new Promise<HTMLImageElement>((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error(`Failed to load media: ${media.name}`));
        img.src = media.thumbnailUrl || media.url;
      });
    });
  }

  // Photo — standard image loading
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Failed to load media: ${media.name}`));
    img.src = media.url;
  });
}

/**
 * Load multiple media items and composite them into a split-screen layout.
 * Returns an OffscreenCanvas (or regular Canvas) that can be used as a CanvasImageSource.
 */
async function loadSplitScreenComposite(
  mediaItems: MediaFile[],
  layout: import('@/types').SlotLayout,
  width: number,
  height: number,
): Promise<CanvasImageSource> {
  // Load all media sources
  const sources = await Promise.all(
    mediaItems.map(m => loadMediaImage(m).catch(() => null)),
  );

  // Filter out failed loads
  const validSources = sources.filter((s): s is CanvasImageSource => s !== null);

  if (validSources.length === 0) {
    throw new Error('No media loaded for split-screen');
  }

  // Create composite canvas
  let compositeCanvas: HTMLCanvasElement | OffscreenCanvas;
  let compositeCtx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

  if (typeof OffscreenCanvas !== 'undefined') {
    compositeCanvas = new OffscreenCanvas(width, height);
    compositeCtx = compositeCanvas.getContext('2d')! as OffscreenCanvasRenderingContext2D;
  } else {
    compositeCanvas = document.createElement('canvas');
    compositeCanvas.width = width;
    compositeCanvas.height = height;
    compositeCtx = compositeCanvas.getContext('2d')!;
  }

  // Render the split-screen layout
  renderSplitScreen(compositeCtx, layout, validSources, width, height);

  return compositeCanvas;
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
//  (Used by preview — does NOT capture frames to ffmpeg)
// ====================================================================

async function renderSlotToCanvas(
  ctx: CanvasRenderingContext2D,
  media: MediaFile,
  width: number,
  height: number,
  slot: TemplateSlot,
  theme: TemplateTheme,
  textOverrides: Record<number, TextOverlayOverride>,
  slotIndex: number,
  engine: EffectsEngine,
): Promise<void> {
  const source = await loadMediaImage(media);
  const isVideo = media.type === 'video' && source instanceof HTMLVideoElement;
  const fps = 30;
  const frames = Math.round(slot.duration * fps);
  const { fx, fy } = getFocusPoint(media, slot.holdPoint);

  // Convert template slot to engine slot config
  const slotConfig = templateSlotToEngineSlot(slot, fx, fy);

  // Create slot array + image map for the engine
  const slotConfigs: SlotConfig[] = [slotConfig];
  const imageMap = new Map<number, CanvasImageSource>();
  imageMap.set(0, source);

  // Initialize particles for this slot
  let particles: Particle[] = [];
  if (theme.particles !== 'none') {
    const particleCount = Math.round(80 * theme.particleDensity);
    particles = createParticles(theme.particles, particleCount, width, height);
  }

  for (let frame = 0; frame < frames; frame++) {
    const t = frames > 1 ? frame / (frames - 1) : 0;
    const globalTime = t * slotConfig.duration;

    // For video media, seek to the correct time for this frame
    if (isVideo) {
      const videoTime = getVideoTime(t, media);
      await seekToTime(source as HTMLVideoElement, videoTime);
    }

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

    // Text overlay (base from template or user-added via overrides)
    {
      const override = textOverrides[slotIndex];
      if (slot.textOverlay) {
        const resolved = resolveTextOverlay(slot.textOverlay, override);
        if (resolved) drawTextOverlay(ctx, resolved, width, height, t);
      } else if (override && typeof override === 'object' && override !== null) {
        // User-added text overlay (no base)
        const defaults: TextOverlay = {
          text: 'Your Text', position: 'center', fontSize: 'lg',
          fontWeight: 'bold', animation: 'fade-in', color: '#ffffff',
        };
        drawTextOverlay(ctx, { ...defaults, ...override } as TextOverlay, width, height, t);
      }
    }

    // Yield to browser every 5 frames to prevent blocking
    if (frame % 5 === 0) {
      await new Promise(r => requestAnimationFrame(r));
    }
  }
}

// ====================================================================
//  renderTransition — draws transition between two slots using v4 engine
//  (Used by preview — does NOT capture frames to ffmpeg)
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

  const fromSource = await loadMediaImage(fromMedia);
  const toSource = await loadMediaImage(toMedia);
  const fromIsVideo = fromMedia.type === 'video' && fromSource instanceof HTMLVideoElement;
  const toIsVideo = toMedia.type === 'video' && toSource instanceof HTMLVideoElement;

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
  imageMap.set(0, fromSource);
  imageMap.set(1, toSource);

  for (let frame = 0; frame < frames; frame++) {
    const t = frames > 1 ? frame / (frames - 1) : 1;

    // Seek video sources during transition
    if (fromIsVideo) {
      const fromProgress = Math.min(1, 0.9 + t * 0.1); // Last 10% of from-clip
      const fromTime = getVideoTime(fromProgress, fromMedia);
      await seekToTime(fromSource as HTMLVideoElement, fromTime);
    }
    if (toIsVideo) {
      const toTime = getVideoTime(t * 0.1, toMedia); // First 10% of to-clip
      await seekToTime(toSource as HTMLVideoElement, toTime);
    }

    // Position the global time within the transition zone (end of slot 0)
    const transStart = fromConfig.duration - transDuration;
    const globalTime = transStart + t * transDuration;

    const engineFrame = engine.calculateFrame(globalTime, slotConfigs);
    engine.renderFrame(ctx, engineFrame, slotConfigs, imageMap);

    // Apply transition overlay if configured
    if (fromSlot.transitionOverlay) {
      renderTransitionOverlay(ctx, fromSlot.transitionOverlay, width, height, t);
    }

    if (frame % 3 === 0) {
      await new Promise(r => requestAnimationFrame(r));
    }
  }
}

// ====================================================================
//  renderSlotFramesToFFmpeg — renders one slot and writes each frame
//  to ffmpeg virtual FS (for MP4 export)
// ====================================================================

async function renderSlotFramesToFFmpeg(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  ffmpeg: import('@ffmpeg/ffmpeg').FFmpeg,
  media: MediaFile,
  width: number,
  height: number,
  slot: TemplateSlot,
  theme: TemplateTheme,
  textOverrides: Record<number, TextOverlayOverride>,
  slotIndex: number,
  engine: EffectsEngine,
  startFrame: number,
  fps: number,
): Promise<number> {
  const source = await loadMediaImage(media);
  const isVideo = media.type === 'video' && source instanceof HTMLVideoElement;
  const frames = Math.round(slot.duration * fps);
  const { fx, fy } = getFocusPoint(media, slot.holdPoint);

  const slotConfig = templateSlotToEngineSlot(slot, fx, fy);
  const slotConfigs: SlotConfig[] = [slotConfig];
  const imageMap = new Map<number, CanvasImageSource>();
  imageMap.set(0, source);

  // Initialize particles
  let particles: Particle[] = [];
  if (theme.particles !== 'none') {
    const particleCount = Math.round(80 * theme.particleDensity);
    particles = createParticles(theme.particles, particleCount, width, height);
  }

  let frameNumber = startFrame;

  for (let frame = 0; frame < frames; frame++) {
    const t = frames > 1 ? frame / (frames - 1) : 0;
    const globalTime = t * slotConfig.duration;

    // For video media, seek to the correct time for this frame
    if (isVideo) {
      const videoTime = getVideoTime(t, media);
      await seekToTime(source as HTMLVideoElement, videoTime);
    }

    const engineFrame = engine.calculateFrame(globalTime, slotConfigs);
    engine.renderFrame(ctx, engineFrame, slotConfigs, imageMap);

    // Theme overlays
    if (theme.tintOverlay) {
      drawTintOverlay(ctx, width, height, theme.tintOverlay);
    }
    if (theme.vignette > 0) {
      drawVignette(ctx, width, height, theme.vignette);
    }
    if (theme.particles !== 'none' && particles.length > 0) {
      drawParticles(ctx, particles, width, height);
      particles = updateParticles(particles, 1 / fps, width, height);
    }
    if (slot.textOverlay) {
      const resolved = resolveTextOverlay(slot.textOverlay, textOverrides[slotIndex]);
      if (resolved) {
        drawTextOverlay(ctx, resolved, width, height, t);
      }
    }

    // Write frame to ffmpeg virtual FS
    await writeFrame(ffmpeg, canvas, frameNumber);
    frameNumber++;

    // Yield to browser every 5 frames to prevent blocking
    if (frame % 5 === 0) {
      await new Promise(r => setTimeout(r, 0));
    }
  }

  return frameNumber;
}

// ====================================================================
//  renderTransitionFramesToFFmpeg — renders transition frames and
//  writes each to ffmpeg virtual FS (for MP4 export)
// ====================================================================

async function renderTransitionFramesToFFmpeg(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  ffmpeg: import('@ffmpeg/ffmpeg').FFmpeg,
  fromMedia: MediaFile,
  toMedia: MediaFile,
  width: number,
  height: number,
  fromSlot: TemplateSlot,
  toSlot: TemplateSlot,
  engine: EffectsEngine,
  startFrame: number,
  fps: number,
): Promise<number> {
  if (toSlot.transition === 'none') return startFrame;

  const fromSource = await loadMediaImage(fromMedia);
  const toSource = await loadMediaImage(toMedia);
  const fromIsVideo = fromMedia.type === 'video' && fromSource instanceof HTMLVideoElement;
  const toIsVideo = toMedia.type === 'video' && toSource instanceof HTMLVideoElement;

  const { fx: fxFrom, fy: fyFrom } = getFocusPoint(fromMedia, fromSlot.holdPoint);
  const { fx: fxTo, fy: fyTo } = getFocusPoint(toMedia, toSlot.holdPoint);

  const fromConfig = templateSlotToEngineSlot(fromSlot, fxFrom, fyFrom);
  const toConfig = templateSlotToEngineSlot(toSlot, fxTo, fyTo);

  const transDuration = toSlot.transitionDuration ?? 0.4;
  const frames = Math.round(transDuration * fps);

  const slotConfigs: SlotConfig[] = [fromConfig, toConfig];
  const imageMap = new Map<number, CanvasImageSource>();
  imageMap.set(0, fromSource);
  imageMap.set(1, toSource);

  let frameNumber = startFrame;

  for (let frame = 0; frame < frames; frame++) {
    const t = frames > 1 ? frame / (frames - 1) : 1;
    const transStart = fromConfig.duration - transDuration;
    const globalTime = transStart + t * transDuration;

    // Seek video sources during transition
    if (fromIsVideo) {
      // From video is near its end during transition
      const fromProgress = Math.min(1, (transStart + t * transDuration) / fromConfig.duration);
      const fromTime = getVideoTime(fromProgress, fromMedia);
      await seekToTime(fromSource as HTMLVideoElement, fromTime);
    }
    if (toIsVideo) {
      // To video starts from beginning during transition
      const toTime = getVideoTime(t * 0.1, toMedia); // First 10% of clip during transition
      await seekToTime(toSource as HTMLVideoElement, toTime);
    }

    const engineFrame = engine.calculateFrame(globalTime, slotConfigs);
    engine.renderFrame(ctx, engineFrame, slotConfigs, imageMap);

    // Apply transition overlay if configured
    if (fromSlot.transitionOverlay) {
      renderTransitionOverlay(ctx, fromSlot.transitionOverlay, width, height, t);
    }

    // Write frame to ffmpeg virtual FS
    await writeFrame(ffmpeg, canvas, frameNumber);
    frameNumber++;

    // Yield every 3 frames
    if (frame % 3 === 0) {
      await new Promise(r => setTimeout(r, 0));
    }
  }

  return frameNumber;
}

// ====================================================================
//  renderSlotFramesToFFmpegWithSource — like renderSlotFramesToFFmpeg
//  but takes a pre-loaded CanvasImageSource (e.g., split-screen composite)
// ====================================================================

async function renderSlotFramesToFFmpegWithSource(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  ffmpeg: import('@ffmpeg/ffmpeg').FFmpeg,
  source: CanvasImageSource,
  media: MediaFile,
  width: number,
  height: number,
  slot: TemplateSlot,
  theme: TemplateTheme,
  textOverrides: Record<number, TextOverlayOverride>,
  slotIndex: number,
  engine: EffectsEngine,
  startFrame: number,
  fps: number,
): Promise<number> {
  const frames = Math.round(slot.duration * fps);
  const { fx, fy } = getFocusPoint(media, slot.holdPoint);

  const slotConfig = templateSlotToEngineSlot(slot, fx, fy);
  const slotConfigs: SlotConfig[] = [slotConfig];
  const imageMap = new Map<number, CanvasImageSource>();
  imageMap.set(0, source);

  // Initialize particles
  let particles: Particle[] = [];
  if (theme.particles !== 'none') {
    const particleCount = Math.round(80 * theme.particleDensity);
    particles = createParticles(theme.particles, particleCount, width, height);
  }

  let frameNumber = startFrame;

  for (let frame = 0; frame < frames; frame++) {
    const t = frames > 1 ? frame / (frames - 1) : 0;
    const globalTime = t * slotConfig.duration;

    const engineFrame = engine.calculateFrame(globalTime, slotConfigs);
    engine.renderFrame(ctx, engineFrame, slotConfigs, imageMap);

    // Theme overlays
    if (theme.tintOverlay) {
      drawTintOverlay(ctx, width, height, theme.tintOverlay);
    }
    if (theme.vignette > 0) {
      drawVignette(ctx, width, height, theme.vignette);
    }
    if (theme.particles !== 'none' && particles.length > 0) {
      drawParticles(ctx, particles, width, height);
      particles = updateParticles(particles, 1 / fps, width, height);
    }
    if (slot.textOverlay) {
      const resolved = resolveTextOverlay(slot.textOverlay, textOverrides[slotIndex]);
      if (resolved) {
        drawTextOverlay(ctx, resolved, width, height, t);
      }
    }

    await writeFrame(ffmpeg, canvas, frameNumber);
    frameNumber++;

    if (frame % 5 === 0) {
      await new Promise(r => setTimeout(r, 0));
    }
  }

  return frameNumber;
}
