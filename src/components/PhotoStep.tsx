'use client';

import { useCallback, useRef, useState } from 'react';
import { PhotoFile } from '@/types';
import { detectFaces } from '@/lib/face-detect';

interface PhotoStepProps {
  photos: PhotoFile[];
  onPhotosChange: (photos: PhotoFile[]) => void;
  onNext: () => void;
}

export default function PhotoStep({ photos, onPhotosChange, onNext }: PhotoStepProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [processing, setProcessing] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  const processFiles = useCallback(async (files: FileList | File[]) => {
    const imageFiles = Array.from(files).filter(f => f.type.startsWith('image/'));
    if (imageFiles.length === 0) return;

    setProcessing(true);

    const newPhotos: PhotoFile[] = [];
    const existingCount = photos.length;

    for (let i = 0; i < imageFiles.length; i++) {
      const file = imageFiles[i];
      const url = URL.createObjectURL(file);

      // Get dimensions
      const dims = await getImageDimensions(url);

      // Detect faces
      const faces = await detectFaces(url);

      newPhotos.push({
        id: `photo-${Date.now()}-${i}`,
        file,
        url,
        name: file.name,
        width: dims.width,
        height: dims.height,
        selected: true,
        faces,
        order: existingCount + i,
      });
    }

    onPhotosChange([...photos, ...newPhotos]);
    setProcessing(false);
  }, [photos, onPhotosChange]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files.length > 0) {
      processFiles(e.dataTransfer.files);
    }
  }, [processFiles]);

  const toggleSelect = (id: string) => {
    onPhotosChange(photos.map(p => p.id === id ? { ...p, selected: !p.selected } : p));
  };

  const removePhoto = (id: string) => {
    const photo = photos.find(p => p.id === id);
    if (photo) URL.revokeObjectURL(photo.url);
    onPhotosChange(photos.filter(p => p.id !== id));
  };

  const selectAll = () => {
    onPhotosChange(photos.map(p => ({ ...p, selected: true })));
  };

  const clearAll = () => {
    photos.forEach(p => URL.revokeObjectURL(p.url));
    onPhotosChange([]);
  };

  const selectedCount = photos.filter(p => p.selected).length;
  const facesDetected = photos.reduce((sum, p) => sum + (p.selected ? p.faces.length : 0), 0);

  return (
    <div className="space-y-6">
      {/* Upload Area */}
      <div
        onDrop={handleDrop}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onClick={() => fileInputRef.current?.click()}
        className={`card-glow p-8 sm:p-12 text-center cursor-pointer transition-all ${
          dragOver ? 'border-accent-gold shadow-gold-lg bg-accent-glow' : ''
        }`}
        role="button"
        aria-label="Upload photos"
        tabIndex={0}
        onKeyDown={(e) => e.key === 'Enter' && fileInputRef.current?.click()}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
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
              {processing ? 'Processing photos...' : 'Drop photos here or click to browse'}
            </p>
            <p className="text-text-muted text-sm mt-1">
              JPG, PNG, WebP, HEIC — Face detection runs automatically
            </p>
          </div>
          {processing && (
            <div className="w-48 progress-bar">
              <div className="progress-bar-fill" style={{ width: '60%' }} />
            </div>
          )}
        </div>
      </div>

      {/* Photo Grid */}
      {photos.length > 0 && (
        <>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <p className="text-sm text-text-secondary">
                <span className="text-accent-gold font-bold">{selectedCount}</span> of{' '}
                <span className="font-medium">{photos.length}</span> selected
              </p>
              {facesDetected > 0 && (
                <span className="text-xs text-accent-gold/70 bg-accent-gold/10 px-2 py-0.5 rounded-full font-mono">
                  {facesDetected} face{facesDetected !== 1 ? 's' : ''} detected
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
            {photos.map((photo) => (
              <div key={photo.id} className="relative group">
                <img
                  src={photo.url}
                  alt={photo.name}
                  onClick={() => toggleSelect(photo.id)}
                  className={`photo-thumb w-full ${photo.selected ? 'selected' : 'opacity-50'}`}
                  loading="lazy"
                />

                {/* Face indicator */}
                {photo.faces.length > 0 && (
                  <span className="absolute top-1 left-1 bg-accent-gold/90 text-bg-main text-[9px] font-bold px-1.5 py-0.5 rounded-full" title={`${photo.faces.length} face(s) detected`}>
                    {photo.faces.length}F
                  </span>
                )}

                {/* Selection check */}
                {photo.selected && (
                  <div className="absolute top-1 right-1 w-5 h-5 bg-accent-gold rounded-full flex items-center justify-center">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#0a0a0f" strokeWidth="3">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  </div>
                )}

                {/* Remove button */}
                <button
                  onClick={(e) => { e.stopPropagation(); removePhoto(photo.id); }}
                  className="absolute bottom-1 right-1 w-6 h-6 bg-red-500/80 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity text-white text-xs"
                  aria-label={`Remove ${photo.name}`}
                >
                  ×
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

function getImageDimensions(url: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = () => resolve({ width: 1920, height: 1080 });
    img.src = url;
  });
}
