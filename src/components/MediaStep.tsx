'use client';

import { useCallback, useRef, useState } from 'react';
import { MediaFile } from '@/types';
import { detectFaces } from '@/lib/face-detect';
import {
  isHeicFile,
  isDefinitelyHeic,
  convertHeicToJpeg,
  isVideoFile,
  isImageFile,
  isMediaFile,
} from '@/lib/heic-convert';

interface MediaStepProps {
  media: MediaFile[];
  onMediaChange: (media: MediaFile[]) => void;
  onNext: () => void;
}

/** Tracks files that failed HEIC conversion for retry */
interface FailedFile {
  file: File;
  error: string;
}

export default function MediaStep({ media, onMediaChange, onNext }: MediaStepProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [processing, setProcessing] = useState(false);
  const [processingMessage, setProcessingMessage] = useState('');
  const [processingPercent, setProcessingPercent] = useState(0);
  const [dragOver, setDragOver] = useState(false);
  const [failedFiles, setFailedFiles] = useState<FailedFile[]>([]);
  const [expandedVideo, setExpandedVideo] = useState<string | null>(null);

  const processFiles = useCallback(async (files: FileList | File[]) => {
    const mediaFiles = Array.from(files).filter(f => isMediaFile(f));
    if (mediaFiles.length === 0) return;

    setProcessing(true);
    setProcessingPercent(0);
    const newFailed: FailedFile[] = [];

    const newMedia: MediaFile[] = [];
    const existingCount = media.length;

    for (let i = 0; i < mediaFiles.length; i++) {
      setProcessingPercent(Math.round(((i) / mediaFiles.length) * 100));
      const file = mediaFiles[i];

      if (isVideoFile(file)) {
        // --- Video processing ---
        setProcessingMessage(`Processing video ${i + 1}/${mediaFiles.length}: ${file.name}`);

        const url = URL.createObjectURL(file);

        try {
          const videoInfo = await getVideoInfo(url);

          newMedia.push({
            id: `media-${Date.now()}-${i}`,
            file,
            url,
            name: file.name,
            width: videoInfo.width,
            height: videoInfo.height,
            selected: true,
            faces: [],
            order: existingCount + i,
            type: 'video',
            duration: videoInfo.duration,
            thumbnailUrl: videoInfo.thumbnailUrl,
          });
        } catch {
          // Fallback if video metadata extraction fails
          newMedia.push({
            id: `media-${Date.now()}-${i}`,
            file,
            url,
            name: file.name,
            width: 1920,
            height: 1080,
            selected: true,
            faces: [],
            order: existingCount + i,
            type: 'video',
            duration: 0,
            thumbnailUrl: undefined,
          });
        }
      } else {
        // --- Image processing ---
        // Use magic byte detection for HEIC to catch misidentified files
        const isHeic = isHeicFile(file) || await isDefinitelyHeic(file);

        let previewUrl: string;
        let previewFile: File = file;

        if (isHeic) {
          setProcessingMessage(`Converting HEIC ${i + 1}/${mediaFiles.length}: ${file.name}`);
          try {
            const converted = await convertHeicToJpeg(file);
            previewUrl = converted.url;
            previewFile = new File(
              [converted.blob],
              file.name.replace(/\.heic$/i, '.jpg').replace(/\.heif$/i, '.jpg'),
              { type: 'image/jpeg' },
            );
          } catch (err) {
            const errorMsg = err instanceof Error ? err.message : 'Unknown conversion error';
            console.error(`[HEIC] Failed: ${file.name}`, err);
            newFailed.push({ file, error: errorMsg });
            continue;
          }
        } else if (isImageFile(file)) {
          previewUrl = URL.createObjectURL(file);
        } else {
          continue;
        }

        setProcessingMessage(`Detecting faces ${i + 1}/${mediaFiles.length}: ${file.name}`);

        const dims = await getImageDimensions(previewUrl);
        const faces = await detectFaces(previewUrl);

        newMedia.push({
          id: `media-${Date.now()}-${i}`,
          file: previewFile,
          url: previewUrl,
          name: file.name,
          width: dims.width,
          height: dims.height,
          selected: true,
          faces,
          order: existingCount + i,
          type: 'photo',
        });
      }
    }

    if (newFailed.length > 0) {
      setFailedFiles(prev => [...prev, ...newFailed]);
    }

    onMediaChange([...media, ...newMedia]);
    setProcessingPercent(100);
    setProcessing(false);
    setProcessingMessage('');
    setProcessingPercent(0);
  }, [media, onMediaChange]);

  const retryFailed = useCallback(async () => {
    if (failedFiles.length === 0) return;
    const files = failedFiles.map(f => f.file);
    setFailedFiles([]);
    await processFiles(files);
  }, [failedFiles, processFiles]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files.length > 0) {
      processFiles(e.dataTransfer.files);
    }
  }, [processFiles]);

  const toggleSelect = (id: string) => {
    onMediaChange(media.map(m => m.id === id ? { ...m, selected: !m.selected } : m));
  };

  const removeMedia = (id: string) => {
    const item = media.find(m => m.id === id);
    if (item) {
      URL.revokeObjectURL(item.url);
      if (item.thumbnailUrl) URL.revokeObjectURL(item.thumbnailUrl);
    }
    onMediaChange(media.filter(m => m.id !== id));
  };

  const handleTrimChange = (id: string, trimStart: number, trimEnd: number) => {
    onMediaChange(
      media.map(m => m.id === id ? { ...m, trimStart, trimEnd } : m),
    );
  };

  const selectAll = () => {
    onMediaChange(media.map(m => ({ ...m, selected: true })));
  };

  const clearAll = () => {
    media.forEach(m => {
      URL.revokeObjectURL(m.url);
      if (m.thumbnailUrl) URL.revokeObjectURL(m.thumbnailUrl);
    });
    onMediaChange([]);
    setFailedFiles([]);
  };

  const selectedCount = media.filter(m => m.selected).length;
  const facesDetected = media.reduce((sum, m) => sum + (m.selected && m.type === 'photo' ? m.faces.length : 0), 0);
  const videoCount = media.filter(m => m.type === 'video').length;

  return (
    <div className="space-y-6 step-content">
      {/* Upload Area */}
      <div
        onDrop={handleDrop}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onClick={() => fileInputRef.current?.click()}
        className={`card-glow p-8 sm:p-12 text-center cursor-pointer transition-all ${
          dragOver ? 'border-accent-gold shadow-gold-lg bg-accent-glow' : 'hover:shadow-gold-sm'
        }`}
        style={dragOver ? { animation: 'dragPulse 1s ease-in-out infinite' } : undefined}
        role="button"
        aria-label="Upload photos and videos"
        tabIndex={0}
        onKeyDown={(e) => e.key === 'Enter' && fileInputRef.current?.click()}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*,video/*,.heic,.heif"
          multiple
          onChange={(e) => e.target.files && processFiles(e.target.files)}
          className="hidden"
          aria-hidden="true"
        />

        <div className="flex flex-col items-center gap-4">
          <div className="w-16 h-16 rounded-2xl bg-accent-gold/10 border border-accent-gold/20 flex items-center justify-center">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" className="text-accent-gold" strokeWidth="1.5">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="17 8 12 3 7 8" />
              <line x1="12" y1="3" x2="12" y2="15" />
            </svg>
          </div>
          <div>
            <p className="text-white font-semibold text-lg">
              {processing ? processingMessage || 'Processing media...' : 'Drop photos & videos here or click to browse'}
            </p>
            <p className="text-text-muted text-sm mt-1">
              JPG, PNG, HEIC, MP4, MOV, WebM — Face detection runs on photos
            </p>
          </div>
          {processing && (
            <div className="w-48">
              <div className="progress-bar">
                <div className="progress-bar-fill" style={{ width: `${Math.max(processingPercent, 5)}%` }} />
              </div>
              <p className="text-xs text-text-muted font-mono mt-1">{processingPercent}%</p>
            </div>
          )}
        </div>
      </div>

      {/* Failed Files Banner */}
      {failedFiles.length > 0 && (
        <div className="card-glow border-red-500/30 bg-red-500/5 p-4">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" className="text-red-400" strokeWidth="2">
                <circle cx="12" cy="12" r="10" />
                <line x1="15" y1="9" x2="9" y2="15" />
                <line x1="9" y1="9" x2="15" y2="15" />
              </svg>
              <p className="text-sm text-red-400 font-medium">
                {failedFiles.length} file{failedFiles.length !== 1 ? 's' : ''} failed to convert
              </p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={retryFailed}
                className="text-xs text-accent-gold hover:underline font-medium"
              >
                Retry All
              </button>
              <button
                onClick={() => setFailedFiles([])}
                className="text-xs text-text-muted hover:text-white"
              >
                Dismiss
              </button>
            </div>
          </div>
          <div className="space-y-1">
            {failedFiles.slice(0, 5).map((f, idx) => (
              <p key={idx} className="text-[11px] text-red-400/70 font-mono truncate">
                {f.file.name}: {f.error}
              </p>
            ))}
            {failedFiles.length > 5 && (
              <p className="text-[11px] text-red-400/50">...and {failedFiles.length - 5} more</p>
            )}
          </div>
        </div>
      )}

      {/* Media Grid */}
      {media.length > 0 && (
        <>
          {/* Stats Bar */}
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-4 flex-wrap">
              <p className="text-sm text-text-secondary">
                <span className="text-accent-gold font-bold">{selectedCount}</span> of{' '}
                <span className="font-medium">{media.length}</span> selected
              </p>
              {facesDetected > 0 && (
                <span className="text-xs text-accent-gold/70 bg-accent-gold/10 px-2 py-0.5 rounded-full font-mono">
                  {facesDetected} face{facesDetected !== 1 ? 's' : ''} detected
                </span>
              )}
              {videoCount > 0 && (
                <span className="text-xs text-accent-gold/70 bg-accent-gold/10 px-2 py-0.5 rounded-full font-mono">
                  {videoCount} video{videoCount !== 1 ? 's' : ''}
                </span>
              )}
            </div>
            <div className="flex gap-2">
              <button onClick={selectAll} className="text-xs text-accent-gold hover:underline">
                Select All
              </button>
              <span className="text-border-subtle">|</span>
              <button onClick={clearAll} className="text-xs text-text-muted hover:text-red-400">
                Clear All
              </button>
            </div>
          </div>

          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-2 sm:gap-3">
            {media.map((item) => (
              <div key={item.id} className="relative group">
                {/* Thumbnail */}
                <img
                  src={item.type === 'video' && item.thumbnailUrl ? item.thumbnailUrl : item.url}
                  alt={item.name}
                  onClick={() => toggleSelect(item.id)}
                  className={`photo-thumb w-full ${item.selected ? 'selected' : 'opacity-50'}`}
                  loading="lazy"
                />

                {/* Video play icon overlay + click to expand trimmer */}
                {item.type === 'video' && (
                  <div
                    className="absolute inset-0 flex items-center justify-center cursor-pointer"
                    onClick={(e) => {
                      e.stopPropagation();
                      setExpandedVideo(expandedVideo === item.id ? null : item.id);
                    }}
                    aria-label="Expand video trimmer"
                  >
                    <div className="w-10 h-10 rounded-full bg-black/60 border border-white/30 flex items-center justify-center hover:bg-black/80 transition-colors">
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="white" className="ml-0.5">
                        <polygon points="5,3 19,12 5,21" />
                      </svg>
                    </div>
                  </div>
                )}

                {/* Video duration badge */}
                {item.type === 'video' && item.duration != null && item.duration > 0 && (
                  <span className="absolute bottom-1 left-1 bg-black/75 text-white text-[10px] font-mono px-1.5 py-0.5 rounded">
                    {item.trimStart != null && item.trimEnd != null
                      ? `${formatDuration(item.trimStart)}-${formatDuration(item.trimEnd)}`
                      : formatDuration(item.duration)}
                  </span>
                )}

                {/* Trim indicator */}
                {item.type === 'video' && item.trimStart != null && item.trimEnd != null && (
                  <span className="absolute bottom-1 right-8 bg-accent-gold/80 text-bg-main text-[8px] font-bold px-1 py-0.5 rounded">
                    TRIMMED
                  </span>
                )}

                {/* Face indicator (photos only) */}
                {item.type === 'photo' && item.faces.length > 0 && (
                  <span
                    className="absolute top-1 left-1 bg-accent-gold/90 text-bg-main text-[9px] font-bold px-1.5 py-0.5 rounded-full"
                    title={`${item.faces.length} face(s) detected`}
                  >
                    {item.faces.length}F
                  </span>
                )}

                {/* Selection check */}
                {item.selected && (
                  <div className="absolute top-1 right-1 w-5 h-5 bg-accent-gold rounded-full flex items-center justify-center">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#0a0a0f" strokeWidth="3">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  </div>
                )}

                {/* Remove button */}
                <button
                  onClick={(e) => { e.stopPropagation(); removeMedia(item.id); }}
                  className="absolute bottom-1 right-1 w-6 h-6 bg-red-500/80 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity text-white text-xs"
                  aria-label={`Remove ${item.name}`}
                >
                  x
                </button>
              </div>
            ))}
          </div>

          {/* Inline Video Trimmer (expands below grid when a video is clicked) */}
          {expandedVideo && (() => {
            const videoItem = media.find(m => m.id === expandedVideo && m.type === 'video');
            if (!videoItem || !videoItem.duration || videoItem.duration <= 0) return null;
            return (
              <VideoTrimmerInline
                media={videoItem}
                onTrimChange={(start, end) => handleTrimChange(videoItem.id, start, end)}
                onClose={() => setExpandedVideo(null)}
              />
            );
          })()}
        </>
      )}

      {/* Next button */}
      <div className="flex justify-end pt-4">
        <button
          onClick={onNext}
          disabled={selectedCount < 2}
          className="btn-gold inline-flex items-center gap-2"
        >
          Choose Template
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="5" y1="12" x2="19" y2="12" />
            <polyline points="12 5 19 12 12 19" />
          </svg>
        </button>
      </div>
    </div>
  );
}

// ====================================================================
// Inline Video Trimmer
// ====================================================================

function VideoTrimmerInline({
  media,
  onTrimChange,
  onClose,
}: {
  media: MediaFile;
  onTrimChange: (trimStart: number, trimEnd: number) => void;
  onClose: () => void;
}) {
  const duration = media.duration || 0;
  const [start, setStart] = useState(media.trimStart ?? 0);
  const [end, setEnd] = useState(media.trimEnd ?? Math.min(duration, 10));
  const [thumbnails, setThumbnails] = useState<string[]>([]);
  const [isExtracting, setIsExtracting] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const stripRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState<'start' | 'end' | 'window' | null>(null);
  const dragStartX = useRef(0);
  const dragStartVal = useRef(0);
  const dragEndVal = useRef(0);

  // Extract thumbnail strip on mount
  const extractThumbnails = useCallback(async () => {
    if (thumbnails.length > 0 || isExtracting) return;
    setIsExtracting(true);

    const count = Math.min(Math.ceil(duration), 20); // Max 20 thumbnails
    const interval = duration / count;
    const thumbs: string[] = [];

    try {
      const video = document.createElement('video');
      video.preload = 'auto';
      video.muted = true;
      video.playsInline = true;
      video.src = media.url;

      await new Promise<void>((resolve, reject) => {
        video.onloadedmetadata = () => resolve();
        video.onerror = () => reject(new Error('Failed to load video'));
      });

      for (let i = 0; i < count; i++) {
        const time = i * interval;
        video.currentTime = time;
        await new Promise<void>((resolve) => {
          video.onseeked = () => resolve();
        });

        const canvas = document.createElement('canvas');
        canvas.width = 80;
        canvas.height = 60;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(video, 0, 0, 80, 60);
          thumbs.push(canvas.toDataURL('image/jpeg', 0.5));
        }
      }
    } catch (err) {
      console.warn('[VideoTrimmer] Thumbnail extraction failed:', err);
    }

    setThumbnails(thumbs);
    setIsExtracting(false);
  }, [duration, media.url, thumbnails.length, isExtracting]);

  // Extract thumbnails on component render
  useState(() => {
    extractThumbnails();
  });

  const handleMouseDown = (type: 'start' | 'end' | 'window', e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragging(type);
    dragStartX.current = e.clientX;
    dragStartVal.current = start;
    dragEndVal.current = end;

    const onMouseMove = (ev: MouseEvent) => {
      if (!stripRef.current) return;
      const rect = stripRef.current.getBoundingClientRect();
      const dx = ev.clientX - dragStartX.current;
      const dt = (dx / rect.width) * duration;

      if (type === 'start') {
        const newStart = Math.max(0, Math.min(dragStartVal.current + dt, end - 0.5));
        setStart(newStart);
      } else if (type === 'end') {
        const newEnd = Math.max(start + 0.5, Math.min(dragEndVal.current + dt, duration));
        setEnd(newEnd);
      } else {
        // Move window
        const windowLen = dragEndVal.current - dragStartVal.current;
        let newStart = dragStartVal.current + dt;
        newStart = Math.max(0, Math.min(newStart, duration - windowLen));
        setStart(newStart);
        setEnd(newStart + windowLen);
      }
    };

    const onMouseUp = () => {
      setDragging(null);
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  };

  const applyTrim = () => {
    onTrimChange(Math.round(start * 100) / 100, Math.round(end * 100) / 100);
  };

  const playSegment = () => {
    if (!videoRef.current) return;
    videoRef.current.currentTime = start;
    videoRef.current.play();
    setIsPlaying(true);
  };

  const handleTimeUpdate = () => {
    if (videoRef.current && videoRef.current.currentTime >= end) {
      videoRef.current.pause();
      setIsPlaying(false);
    }
  };

  const selectedDuration = end - start;
  const startPct = (start / duration) * 100;
  const widthPct = ((end - start) / duration) * 100;

  return (
    <div className="card-glow p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" className="text-accent-gold" strokeWidth="2">
            <rect x="2" y="4" width="20" height="16" rx="2" />
            <path d="M2 8h20" />
          </svg>
          <p className="text-sm font-bold text-white">{media.name}</p>
          <span className="text-[10px] text-text-muted font-mono">{formatDuration(duration)} total</span>
        </div>
        <button onClick={onClose} className="text-text-muted hover:text-white p-1">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>

      {/* Video preview */}
      <div className="relative mb-3 rounded-lg overflow-hidden bg-black" style={{ maxHeight: '200px' }}>
        <video
          ref={videoRef}
          src={media.url}
          muted
          playsInline
          onTimeUpdate={handleTimeUpdate}
          className="w-full max-h-[200px] object-contain"
        />
      </div>

      {/* Thumbnail strip with draggable range */}
      <div className="relative mb-3" ref={stripRef}>
        {/* Thumbnail filmstrip */}
        <div className="flex rounded-lg overflow-hidden h-12 bg-black/30">
          {thumbnails.length > 0
            ? thumbnails.map((thumb, i) => (
                <img key={i} src={thumb} alt="" className="h-12 object-cover flex-1 min-w-0" />
              ))
            : (
              <div className="flex-1 flex items-center justify-center">
                <span className="text-[10px] text-text-muted">
                  {isExtracting ? 'Extracting frames...' : 'Loading...'}
                </span>
              </div>
            )
          }
        </div>

        {/* Dimmed outside region */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background: `linear-gradient(to right, rgba(0,0,0,0.6) ${startPct}%, transparent ${startPct}%, transparent ${startPct + widthPct}%, rgba(0,0,0,0.6) ${startPct + widthPct}%)`,
          }}
        />

        {/* Selected range highlight */}
        <div
          className="absolute top-0 bottom-0 border-2 border-accent-gold rounded cursor-move"
          style={{
            left: `${startPct}%`,
            width: `${widthPct}%`,
            background: 'rgba(255, 215, 0, 0.08)',
          }}
          onMouseDown={(e) => handleMouseDown('window', e)}
        />

        {/* Start handle */}
        <div
          className="absolute top-0 bottom-0 w-3 bg-accent-gold rounded-l cursor-col-resize flex items-center justify-center"
          style={{ left: `calc(${startPct}% - 6px)` }}
          onMouseDown={(e) => handleMouseDown('start', e)}
        >
          <div className="w-0.5 h-4 bg-bg-main rounded" />
        </div>

        {/* End handle */}
        <div
          className="absolute top-0 bottom-0 w-3 bg-accent-gold rounded-r cursor-col-resize flex items-center justify-center"
          style={{ left: `calc(${startPct + widthPct}% - 6px)` }}
          onMouseDown={(e) => handleMouseDown('end', e)}
        >
          <div className="w-0.5 h-4 bg-bg-main rounded" />
        </div>
      </div>

      {/* Controls */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={playSegment}
            className="text-xs text-accent-gold hover:underline flex items-center gap-1"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
              <polygon points="5,3 19,12 5,21" />
            </svg>
            {isPlaying ? 'Playing...' : 'Preview'}
          </button>
          <span className="text-xs text-text-muted font-mono">
            {formatDuration(start)} — {formatDuration(end)} ({formatDuration(selectedDuration)})
          </span>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => { setStart(0); setEnd(Math.min(duration, 10)); }}
            className="text-xs text-text-muted hover:text-white"
          >
            Reset
          </button>
          <button
            onClick={applyTrim}
            className="text-xs bg-accent-gold/10 text-accent-gold border border-accent-gold/30 px-3 py-1 rounded-lg hover:bg-accent-gold/20 transition-colors font-medium"
          >
            Apply Trim
          </button>
        </div>
      </div>
    </div>
  );
}

// ====================================================================
// Utilities
// ====================================================================

/**
 * Get image dimensions from a URL.
 */
function getImageDimensions(url: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = () => resolve({ width: 1920, height: 1080 });
    img.src = url;
  });
}

/**
 * Extract video metadata: dimensions, duration, and a thumbnail captured at 1 second.
 */
function getVideoInfo(url: string): Promise<{ width: number; height: number; duration: number; thumbnailUrl: string }> {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.muted = true;
    video.playsInline = true;

    let resolved = false;

    const cleanup = () => {
      video.removeEventListener('loadedmetadata', onMetadata);
      video.removeEventListener('seeked', onSeeked);
      video.removeEventListener('error', onError);
    };

    const onError = () => {
      cleanup();
      if (!resolved) {
        resolved = true;
        reject(new Error('Failed to load video'));
      }
    };

    const onSeeked = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          canvas.toBlob((blob) => {
            cleanup();
            if (blob && !resolved) {
              resolved = true;
              resolve({
                width: video.videoWidth,
                height: video.videoHeight,
                duration: video.duration,
                thumbnailUrl: URL.createObjectURL(blob),
              });
            } else if (!resolved) {
              resolved = true;
              reject(new Error('Failed to create thumbnail blob'));
            }
          }, 'image/jpeg', 0.85);
        } else {
          cleanup();
          if (!resolved) {
            resolved = true;
            reject(new Error('Failed to get canvas context'));
          }
        }
      } catch (err) {
        cleanup();
        if (!resolved) {
          resolved = true;
          reject(err);
        }
      }
    };

    const onMetadata = () => {
      // Seek to 1 second (or 0 if video is shorter)
      video.currentTime = Math.min(1, video.duration || 0);
    };

    video.addEventListener('loadedmetadata', onMetadata);
    video.addEventListener('seeked', onSeeked);
    video.addEventListener('error', onError);

    video.src = url;
  });
}

/**
 * Format seconds into mm:ss display.
 */
function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}
