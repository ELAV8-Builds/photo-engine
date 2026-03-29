'use client';

import { TEMPLATES } from '@/lib/templates';
import { PhotoFile } from '@/types';

interface TemplateStepProps {
  selectedTemplate: string | null;
  onSelectTemplate: (id: string) => void;
  photos: PhotoFile[];
  durationPerPhoto: number;
  onDurationChange: (d: number) => void;
  aspectRatio: '16:9' | '9:16' | '1:1';
  onAspectChange: (a: '16:9' | '9:16' | '1:1') => void;
  onNext: () => void;
  onBack: () => void;
}

const ASPECT_OPTIONS: { value: '16:9' | '9:16' | '1:1'; label: string; icon: string }[] = [
  { value: '16:9', label: 'Landscape', icon: '▬' },
  { value: '9:16', label: 'Portrait', icon: '▮' },
  { value: '1:1', label: 'Square', icon: '■' },
];

export default function TemplateStep({
  selectedTemplate,
  onSelectTemplate,
  photos,
  durationPerPhoto,
  onDurationChange,
  aspectRatio,
  onAspectChange,
  onNext,
  onBack,
}: TemplateStepProps) {
  const selectedPhotos = photos.filter(p => p.selected);
  const totalDuration = selectedPhotos.length * durationPerPhoto;
  const minutes = Math.floor(totalDuration / 60);
  const seconds = Math.round(totalDuration % 60);

  return (
    <div className="space-y-6">
      {/* Templates Grid */}
      <div>
        <h2 className="text-lg font-bold text-white mb-1">Choose a Style</h2>
        <p className="text-sm text-text-muted mb-4">
          {selectedPhotos.length} photos selected — estimated {minutes > 0 ? `${minutes}m ` : ''}{seconds}s
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {TEMPLATES.map((template) => (
            <button
              key={template.id}
              onClick={() => onSelectTemplate(template.id)}
              className={`template-card text-left transition-all ${
                selectedTemplate === template.id ? 'selected' : ''
              }`}
              aria-pressed={selectedTemplate === template.id}
            >
              {/* Template preview */}
              <div className="relative h-32 rounded-lg overflow-hidden mb-3 bg-bg-main">
                {/* Preview using actual photos */}
                <div className="absolute inset-0 flex">
                  {selectedPhotos.slice(0, 3).map((photo, i) => (
                    <div
                      key={photo.id}
                      className="flex-1 relative overflow-hidden"
                      style={{
                        transform: template.style === 'cinematic'
                          ? `scale(1.1) translateX(${(i - 1) * 5}%)`
                          : template.style === 'dynamic'
                          ? `rotate(${(i - 1) * 3}deg)`
                          : template.style === 'parallax'
                          ? `perspective(500px) rotateY(${(i - 1) * 8}deg)`
                          : undefined,
                        transition: 'transform 0.3s ease',
                      }}
                    >
                      <img
                        src={photo.url}
                        alt=""
                        className="absolute inset-0 w-full h-full object-cover"
                        style={{
                          filter: template.style === 'retro'
                            ? 'saturate(0.6) contrast(1.2) sepia(0.3)'
                            : template.style === 'glitch'
                            ? 'hue-rotate(10deg) contrast(1.1)'
                            : undefined,
                        }}
                      />
                    </div>
                  ))}
                  {selectedPhotos.length === 0 && (
                    <div className="flex-1 bg-gradient-to-br from-bg-hover to-bg-card flex items-center justify-center">
                      <span className="text-text-muted text-xs">No photos</span>
                    </div>
                  )}
                </div>

                {/* Style overlay */}
                {template.style === 'retro' && (
                  <div className="absolute inset-0 pointer-events-none" style={{
                    background: 'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,0,0,0.1) 2px, rgba(0,0,0,0.1) 4px)',
                  }} />
                )}
                {template.style === 'glitch' && (
                  <div className="absolute inset-0 pointer-events-none mix-blend-screen" style={{
                    background: 'linear-gradient(transparent 50%, rgba(0,255,255,0.03) 50%)',
                    backgroundSize: '100% 4px',
                  }} />
                )}

                {/* Color accent bar */}
                <div
                  className="absolute bottom-0 left-0 right-0 h-1"
                  style={{ background: template.color }}
                />
              </div>

              <div className="flex items-start justify-between gap-2">
                <div>
                  <h3 className="font-bold text-white text-sm">{template.name}</h3>
                  <p className="text-xs text-text-muted mt-0.5 line-clamp-2">{template.description}</p>
                </div>
                <span className="text-[10px] font-mono text-text-muted whitespace-nowrap">
                  {template.durationPerPhoto}s/photo
                </span>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Settings */}
      <div className="card-glow p-6">
        <h3 className="text-sm font-bold text-text-muted uppercase tracking-wider mb-4">Settings</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          {/* Duration per photo */}
          <div>
            <label htmlFor="duration" className="text-xs text-text-muted block mb-2">
              Duration per Photo: <span className="text-accent-gold font-mono">{durationPerPhoto}s</span>
            </label>
            <input
              id="duration"
              type="range"
              min="1"
              max="8"
              step="0.5"
              value={durationPerPhoto}
              onChange={(e) => onDurationChange(parseFloat(e.target.value))}
              className="w-full accent-accent-gold"
            />
            <div className="flex justify-between text-[10px] text-text-muted mt-1">
              <span>1s (fast)</span>
              <span>8s (slow)</span>
            </div>
          </div>

          {/* Aspect ratio */}
          <div>
            <p className="text-xs text-text-muted mb-2">Aspect Ratio</p>
            <div className="flex gap-2">
              {ASPECT_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => onAspectChange(opt.value)}
                  className={`flex-1 py-2 rounded-lg text-xs font-medium transition-all border ${
                    aspectRatio === opt.value
                      ? 'bg-accent-gold/10 border-accent-gold/40 text-accent-gold'
                      : 'bg-bg-input border-border-subtle text-text-muted hover:text-white'
                  }`}
                  aria-pressed={aspectRatio === opt.value}
                >
                  <span className="block text-lg mb-0.5" aria-hidden="true">{opt.icon}</span>
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <div className="flex items-center justify-between pt-4">
        <button onClick={onBack} className="btn-outline">
          Back
        </button>
        <button
          onClick={onNext}
          disabled={!selectedTemplate}
          className="btn-gold inline-flex items-center gap-2"
        >
          Add Music
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="5" y1="12" x2="19" y2="12" />
            <polyline points="12 5 19 12 12 19" />
          </svg>
        </button>
      </div>
    </div>
  );
}
