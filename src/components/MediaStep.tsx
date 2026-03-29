'use client';

import { useCallback, useRef, useState } from 'react';
import { MediaFile } from '@/types';
import { detectFaces } from '@/lib/face-detect';
import { isHeicFile, convertHeicToJpeg, isVideoFile, isImageFile, isMediaFile } from '@/lib/heic-convert';

interface MediaStepProps {
  media: MediaFile[];
  onMediaChange: (media: MediaFile[]) => void;
  onNext: () => void;
}

export default function MediaStep({ media, onMediaChange, onNext }: MediaStepProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [processing, setProcessing] = useState(false);
  const [processingMessage, setProcessingMessage] = useState('');
  const [processingPercent, setProcessingPercent] = useState(0);
  const [dragOver, setDragOver] = useState(false);

  const processFiles = useCallback(async (files: FileList | File[]) => {
    const mediaFiles = Array.from(files).filter(f => isMediaFile(f));
    if (mediaFiles.length === 0) return;

    setProcessing(true);
    setProcessingPercent(0);

    const newMedia: MediaFile[] = [];
    const existingCount = media.length;

    for (let i = 0; i < mediaFiles.length; i++) {
      setProcessingPercent(Math.round(((i) / mediaFiles.length) * 100));
      const file = mediaFiles[i];

      if (isVideoFile(file)) {
        // --- Video processing ---
        setProcessingMessage(`Processing video ${i + 1}/${mediaFiles.length}...`);

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
      } else if (isImageFile(file)) {
        // --- Image processing ---
        let previewUrl: string;
        let previewFile: File = file;

        if (isHeicFile(file)) {
          setProcessingMessage(`Converting HEIC ${i + 1}/${mediaFiles.length}...`);
          try {
            const converted = await convertHeicToJpeg(file);
            previewUrl = converted.url;
            previewFile = new File([converted.blob], file.name.replace(/\.heic$/i, '.jpg').replace(/\.heif$/i, '.jpg'), {
              type: 'image/jpeg',
            });
          } catch {
            // If HEIC conversion fails, try using original
            setProcessingMessage(`HEIC conversion failed for ${file.name}, skipping...`);
            previewUrl = URL.createObjectURL(file);
          }
        } else {
          previewUrl = URL.createObjectURL(file);
        }

        setProcessingMessage(`Detecting faces ${i + 1}/${mediaFiles.length}...`);

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

    onMediaChange([...media, ...newMedia]);
    setProcessingPercent(100);
    setProcessing(false);
    setProcessingMessage('');
    setProcessingPercent(0);
  }, [media, onMediaChange]);

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

  const selectAll = () => {
    onMediaChange(media.map(m => ({ ...m, selected: true })));
  };

  const clearAll = () => {
    media.forEach(m => {
      URL.revokeObjectURL(m.url);
      if (m.thumbnailUrl) URL.revokeObjectURL(m.thumbnailUrl);
    });
    onMediaChange([]);
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

                {/* Video play icon overlay */}
                {item.type === 'video' && (
                  <div
                    className="absolute inset-0 flex items-center justify-center pointer-events-none"
                    aria-hidden="true"
                  >
                    <div className="w-10 h-10 rounded-full bg-black/60 border border-white/30 flex items-center justify-center">
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="white" className="ml-0.5">
                        <polygon points="5,3 19,12 5,21" />
                      </svg>
                    </div>
                  </div>
                )}

                {/* Video duration badge */}
                {item.type === 'video' && item.duration != null && item.duration > 0 && (
                  <span className="absolute bottom-1 left-1 bg-black/75 text-white text-[10px] font-mono px-1.5 py-0.5 rounded">
                    {formatDuration(item.duration)}
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
