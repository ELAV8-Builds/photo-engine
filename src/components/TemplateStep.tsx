'use client';

import { useState, useEffect, useMemo } from 'react';
import { SMART_TEMPLATES, assignMediaToSlots, formatDuration } from '@/lib/templates';
import { getParticleCSS } from '@/lib/particles';
import { MediaFile, SmartTemplate } from '@/types';
import TemplateMixer, { type MixerOverrides } from '@/components/TemplateMixer';

interface TemplateStepProps {
  selectedTemplate: string | null;
  onSelectTemplate: (id: string) => void;
  media: MediaFile[];
  aspectRatio: '16:9' | '9:16' | '1:1';
  onAspectChange: (a: '16:9' | '9:16' | '1:1') => void;
  onNext: () => void;
  onBack: () => void;
  textOverrides: Record<number, string | null>;
  onTextOverridesChange: (overrides: Record<number, string | null>) => void;
  mixerOverrides: MixerOverrides;
  onMixerOverridesChange: (overrides: MixerOverrides) => void;
}

const STYLE_ICONS: Record<string, string> = {
  cinematic: '/icons/cinematic.svg',
  dynamic: '/icons/dynamic.svg',
  minimal: '/icons/minimal.svg',
  retro: '/icons/retro.svg',
  glitch: '/icons/glitch.svg',
  parallax: '/icons/parallax.svg',
  summer: '/icons/summer.svg',
  winter: '/icons/winter.svg',
  party: '/icons/party.svg',
  electric: '/icons/electric.svg',
  golden: '/icons/golden.svg',
  neon: '/icons/neon.svg',
};

const ASPECT_OPTIONS: { value: '16:9' | '9:16' | '1:1'; label: string; icon: string }[] = [
  { value: '16:9', label: 'Landscape', icon: '\u25AC' },
  { value: '9:16', label: 'Portrait', icon: '\u25AE' },
  { value: '1:1', label: 'Square', icon: '\u25A0' },
];

function getSlotTypeColor(slotType: 'photo' | 'video' | 'any'): string {
  switch (slotType) {
    case 'photo': return '#FFD700';
    case 'video': return '#60A5FA';
    case 'any': return 'linear-gradient(135deg, #FFD700, #60A5FA)';
  }
}

function getSlotTypeBg(slotType: 'photo' | 'video' | 'any'): string {
  switch (slotType) {
    case 'photo': return 'rgba(255, 215, 0, 0.15)';
    case 'video': return 'rgba(96, 165, 250, 0.15)';
    case 'any': return 'rgba(255, 215, 0, 0.1)';
  }
}

/* ------------------------------------------------------------------ */
/*  Animated Preview for a single template card                       */
/* ------------------------------------------------------------------ */
function AnimatedPreview({
  template,
  media,
}: {
  template: SmartTemplate;
  media: MediaFile[];
}) {
  const [previewSlotIndex, setPreviewSlotIndex] = useState(0);
  const [fade, setFade] = useState(true);

  const selectedMedia = media.filter((m) => m.selected);
  const mediaIds = selectedMedia.map((m) => m.id);
  const slotAssignments = assignMediaToSlots(template, mediaIds);

  // Map id back to media object for display
  const mediaById = useMemo(() => {
    const map = new Map<string, MediaFile>();
    selectedMedia.forEach((m) => map.set(m.id, m));
    return map;
  }, [selectedMedia]);

  // Cycle through slots at the pace of each slot's duration
  useEffect(() => {
    if (selectedMedia.length === 0) return;

    const slot = template.slots[previewSlotIndex];
    if (!slot) return;

    // Use slot duration in ms, clamped to at least 600ms for UX
    const durationMs = Math.max(slot.duration * 1000, 600);

    // Start fade-out 300ms before switch
    const fadeOutTimer = setTimeout(() => setFade(false), durationMs - 300);
    const advanceTimer = setTimeout(() => {
      setPreviewSlotIndex((prev) => (prev + 1) % template.slots.length);
      setFade(true);
    }, durationMs);

    return () => {
      clearTimeout(fadeOutTimer);
      clearTimeout(advanceTimer);
    };
  }, [previewSlotIndex, template.slots, selectedMedia.length]);

  // Get current display media
  const currentMediaId = slotAssignments[previewSlotIndex] || '';
  const currentMedia = mediaById.get(currentMediaId);

  const imgSrc = currentMedia
    ? currentMedia.type === 'video'
      ? currentMedia.thumbnailUrl || currentMedia.url
      : currentMedia.url
    : null;

  return (
    <div className="absolute inset-0">
      {imgSrc ? (
        <img
          src={imgSrc}
          alt=""
          className="absolute inset-0 w-full h-full object-cover transition-opacity duration-300"
          style={{
            opacity: fade ? 1 : 0,
            filter:
              template.style === 'retro'
                ? 'saturate(0.6) contrast(1.2) sepia(0.3)'
                : template.style === 'glitch'
                ? 'hue-rotate(10deg) contrast(1.1)'
                : undefined,
          }}
        />
      ) : (
        <div className="flex-1 h-full bg-gradient-to-br from-bg-hover to-bg-card flex flex-col items-center justify-center gap-2">
          <img src={STYLE_ICONS[template.style] || STYLE_ICONS.cinematic} alt="" className="w-10 h-10 opacity-40" />
          <span className="text-text-muted text-xs">Add media to preview</span>
        </div>
      )}

      {/* Slot index indicator dots */}
      {selectedMedia.length > 0 && (
        <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex gap-1">
          {template.slots.slice(0, 8).map((_, i) => (
            <div
              key={i}
              className="w-1.5 h-1.5 rounded-full transition-all duration-200"
              style={{
                background: i === previewSlotIndex ? template.color : 'rgba(255,255,255,0.3)',
                transform: i === previewSlotIndex ? 'scale(1.4)' : 'scale(1)',
              }}
            />
          ))}
          {template.slots.length > 8 && (
            <span className="text-[8px] text-white/50 ml-0.5">+{template.slots.length - 8}</span>
          )}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Timeline Visualization                                            */
/* ------------------------------------------------------------------ */
function TimelineVisualization({
  template,
  media,
}: {
  template: SmartTemplate;
  media: MediaFile[];
}) {
  const selectedMedia = media.filter((m) => m.selected);
  const mediaIds = selectedMedia.map((m) => m.id);
  const slotAssignments = assignMediaToSlots(template, mediaIds);

  const mediaById = useMemo(() => {
    const map = new Map<string, MediaFile>();
    selectedMedia.forEach((m) => map.set(m.id, m));
    return map;
  }, [selectedMedia]);

  const mediaCountDiff = selectedMedia.length - template.slots.length;

  return (
    <div className="card-glow p-5">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-bold text-white">Timeline</h3>
        <span className="text-xs text-text-muted font-mono">
          {formatDuration(template.totalDuration)} total
        </span>
      </div>

      {/* Horizontal slot bar */}
      <div className="flex rounded-lg overflow-hidden h-14 gap-px bg-black/20">
        {template.slots.map((slot, i) => {
          const widthPercent = (slot.duration / template.totalDuration) * 100;
          const assignedMedia = mediaById.get(slotAssignments[i] || '');
          const thumbSrc = assignedMedia
            ? assignedMedia.type === 'video'
              ? assignedMedia.thumbnailUrl || assignedMedia.url
              : assignedMedia.url
            : null;

          return (
            <div
              key={i}
              className="relative flex flex-col items-center justify-end overflow-hidden group"
              style={{
                width: `${widthPercent}%`,
                minWidth: '28px',
                background: getSlotTypeBg(slot.slotType),
              }}
              title={`Slot ${i + 1}: ${slot.duration}s | ${slot.transition} | ${slot.effect}`}
            >
              {/* Thumbnail background */}
              {thumbSrc && (
                <img
                  src={thumbSrc}
                  alt=""
                  className="absolute inset-0 w-full h-full object-cover opacity-30"
                />
              )}

              {/* Color top bar */}
              <div
                className="absolute top-0 left-0 right-0 h-1"
                style={{
                  background: getSlotTypeColor(slot.slotType),
                }}
              />

              {/* Slot info overlay */}
              <div className="relative z-10 text-center pb-1 px-0.5">
                <span className="text-[9px] font-mono text-white/80 block leading-tight">
                  {slot.duration}s
                </span>
                <span className="text-[8px] text-text-muted block leading-tight truncate">
                  {slot.transition}
                </span>
                <span className="text-[7px] text-text-muted/60 block leading-tight truncate">
                  {slot.effect}
                </span>
              </div>

              {/* Hover tooltip */}
              <div className="absolute -top-12 left-1/2 -translate-x-1/2 bg-bg-card border border-border-subtle rounded px-2 py-1 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-20 whitespace-nowrap">
                <p className="text-[10px] text-white font-medium">Slot {i + 1}</p>
                <p className="text-[9px] text-text-muted">
                  {slot.duration}s &middot; {slot.transition} &middot; {slot.effect}
                </p>
                {assignedMedia && (
                  <p className="text-[9px] text-accent-gold truncate max-w-[120px]">
                    {assignedMedia.name}
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Legend & media notes */}
      <div className="flex items-center justify-between mt-3 flex-wrap gap-2">
        <div className="flex items-center gap-3 text-[10px] text-text-muted">
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-sm inline-block" style={{ background: '#FFD700' }} />
            Photo
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-sm inline-block" style={{ background: '#60A5FA' }} />
            Video
          </span>
          <span className="flex items-center gap-1">
            <span
              className="w-2 h-2 rounded-sm inline-block"
              style={{ background: 'linear-gradient(135deg, #FFD700, #60A5FA)' }}
            />
            Any
          </span>
        </div>

        {mediaCountDiff < 0 && (
          <span className="text-[10px] text-amber-400 bg-amber-400/10 px-2 py-0.5 rounded">
            Media will repeat to fill {Math.abs(mediaCountDiff)} extra slot{Math.abs(mediaCountDiff) !== 1 ? 's' : ''}
          </span>
        )}
        {mediaCountDiff > 0 && (
          <span className="text-[10px] text-emerald-400 bg-emerald-400/10 px-2 py-0.5 rounded">
            Template will expand to fit all {selectedMedia.length} items
          </span>
        )}
        {mediaCountDiff === 0 && selectedMedia.length > 0 && (
          <span className="text-[10px] text-emerald-400 bg-emerald-400/10 px-2 py-0.5 rounded">
            Perfect fit
          </span>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Text Overlay Editor                                                */
/* ------------------------------------------------------------------ */
function TextOverlayEditor({
  template,
  textOverrides,
  onTextOverridesChange,
}: {
  template: SmartTemplate;
  textOverrides: Record<number, string | null>;
  onTextOverridesChange: (overrides: Record<number, string | null>) => void;
}) {
  // Find all slots that have textOverlay
  const textSlots = template.slots
    .map((slot, i) => ({ slot, index: i }))
    .filter(({ slot }) => slot.textOverlay);

  if (textSlots.length === 0 && template.defaultTexts.length === 0) return null;

  return (
    <div className="card-glow p-5">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-bold text-white flex items-center gap-2">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" className="text-accent-gold" strokeWidth="2">
            <path d="M4 7V4h16v3" />
            <path d="M9 20h6" />
            <path d="M12 4v16" />
          </svg>
          Text Overlays
        </h3>
        <span className="text-[10px] text-text-muted">{textSlots.length} text{textSlots.length !== 1 ? 's' : ''}</span>
      </div>

      <div className="space-y-3">
        {textSlots.map(({ slot, index }) => {
          const overlay = slot.textOverlay!;
          const isRemoved = textOverrides[index] === null;
          const currentText = textOverrides[index] !== undefined
            ? textOverrides[index]
            : overlay.text;

          return (
            <div key={index} className={`flex items-center gap-3 ${isRemoved ? 'opacity-40' : ''}`}>
              {/* Slot badge */}
              <span className="text-[10px] font-mono text-text-muted bg-bg-input px-2 py-1 rounded shrink-0">
                Slot {index + 1}
              </span>

              {/* Text input */}
              <input
                type="text"
                value={isRemoved ? '' : (currentText || '')}
                onChange={(e) => {
                  onTextOverridesChange({
                    ...textOverrides,
                    [index]: e.target.value,
                  });
                }}
                disabled={isRemoved}
                placeholder={overlay.text}
                className="flex-1 px-3 py-1.5 bg-bg-input border border-border-subtle rounded-lg text-xs text-white placeholder:text-text-muted focus:border-accent-gold focus:outline-none disabled:opacity-50"
              />

              {/* Animation badge */}
              <span className="text-[9px] font-mono text-accent-gold/60 bg-accent-gold/5 px-1.5 py-0.5 rounded shrink-0">
                {overlay.animation}
              </span>

              {/* Position badge */}
              <span className="text-[9px] font-mono text-text-muted shrink-0">
                {overlay.position}
              </span>

              {/* Remove/restore button */}
              <button
                onClick={() => {
                  if (isRemoved) {
                    const next = { ...textOverrides };
                    delete next[index];
                    onTextOverridesChange(next);
                  } else {
                    onTextOverridesChange({
                      ...textOverrides,
                      [index]: null,
                    });
                  }
                }}
                className={`p-1 rounded transition-colors ${
                  isRemoved
                    ? 'text-accent-gold hover:bg-accent-gold/10'
                    : 'text-text-muted hover:text-red-400 hover:bg-red-400/10'
                }`}
                aria-label={isRemoved ? 'Restore text' : 'Remove text'}
                title={isRemoved ? 'Restore text' : 'Remove text'}
              >
                {isRemoved ? (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M3 12a9 9 0 1 0 9-9 9 9 0 0 0-9 9" />
                    <path d="M12 8v4l2 2" />
                  </svg>
                ) : (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                )}
              </button>
            </div>
          );
        })}
      </div>

      <p className="text-[10px] text-text-muted mt-3">
        Edit text or remove overlays. Changes only affect your export.
      </p>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main Component                                                     */
/* ------------------------------------------------------------------ */
export default function TemplateStep({
  selectedTemplate,
  onSelectTemplate,
  media,
  aspectRatio,
  onAspectChange,
  onNext,
  onBack,
  textOverrides,
  onTextOverridesChange,
  mixerOverrides,
  onMixerOverridesChange,
}: TemplateStepProps) {
  const [showMixer, setShowMixer] = useState(false);
  const selectedMedia = media.filter((m) => m.selected);
  const activeTemplate = SMART_TEMPLATES.find((t) => t.id === selectedTemplate) || null;
  const hasOverrides = Object.values(mixerOverrides).some(v => v !== undefined && v !== null && (Array.isArray(v) ? v.length > 0 : true));

  return (
    <div className="space-y-6 step-content">
      {/* Header */}
      <div>
        <h2 className="text-lg font-bold text-white mb-1">Choose a Template</h2>
        <p className="text-sm text-text-muted mb-4">
          {selectedMedia.length} media selected &mdash; pick a style to shape your video
        </p>
      </div>

      {/* Templates Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
        {SMART_TEMPLATES.map((template) => {
          const isSelected = selectedTemplate === template.id;
          return (
            <button
              key={template.id}
              onClick={() => onSelectTemplate(template.id)}
              className={`template-card text-left transition-all ${isSelected ? 'selected' : ''}`}
              style={
                isSelected
                  ? {
                      borderColor: 'rgba(255, 215, 0, 0.4)',
                      boxShadow: '0 0 20px rgba(255, 215, 0, 0.15)',
                    }
                  : undefined
              }
              aria-pressed={isSelected}
            >
              {/* Animated preview area */}
              <div className="relative h-36 rounded-lg overflow-hidden mb-3 bg-bg-main">
                <AnimatedPreview template={template} media={media} />

                {/* Emoji badge */}
                <div className="absolute top-2 left-2 z-10 bg-black/50 backdrop-blur-sm rounded-lg px-1.5 py-0.5">
                  <span className="text-sm">{template.emoji}</span>
                </div>

                {/* Style overlay: Retro scanlines */}
                {template.style === 'retro' && (
                  <div
                    className="absolute inset-0 pointer-events-none"
                    style={{
                      background:
                        'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,0,0,0.15) 2px, rgba(0,0,0,0.15) 4px)',
                    }}
                  />
                )}

                {/* Style overlay: Glitch CRT lines */}
                {template.style === 'glitch' && (
                  <div
                    className="absolute inset-0 pointer-events-none mix-blend-screen"
                    style={{
                      background: 'linear-gradient(transparent 50%, rgba(0,255,255,0.04) 50%)',
                      backgroundSize: '100% 4px',
                    }}
                  />
                )}

                {/* Particle preview overlay */}
                {template.theme.particles !== 'none' && (
                  <div
                    className="absolute inset-0 pointer-events-none"
                    style={{
                      backgroundImage: getParticleCSS(template.theme.particles, template.theme.particleDensity),
                    }}
                  />
                )}

                {/* Theme tint overlay */}
                {template.theme.tintOverlay && (
                  <div
                    className="absolute inset-0 pointer-events-none"
                    style={{ background: template.theme.tintOverlay }}
                  />
                )}

                {/* Color accent bar at bottom of preview */}
                <div
                  className="absolute bottom-0 left-0 right-0 h-1"
                  style={{ background: template.color }}
                />

                {/* Selected checkmark */}
                {isSelected && (
                  <div className="absolute top-2 right-2 w-6 h-6 rounded-full bg-accent-gold flex items-center justify-center">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#000" strokeWidth="3">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  </div>
                )}
              </div>

              {/* Template info */}
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-start gap-2.5 min-w-0">
                  <img
                    src={STYLE_ICONS[template.style] || STYLE_ICONS.cinematic}
                    alt=""
                    className="w-7 h-7 mt-0.5 shrink-0 opacity-70"
                    aria-hidden="true"
                  />
                  <div className="min-w-0">
                    <h3 className="font-bold text-white text-sm">{template.name}</h3>
                    <p className="text-xs text-text-muted mt-0.5 line-clamp-2">
                      {template.description}
                    </p>
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <span className="text-[10px] font-mono text-accent-gold block">
                    {formatDuration(template.totalDuration)}
                  </span>
                  <span className="text-[10px] font-mono text-text-muted block">
                    {selectedMedia.length > template.mediaCount
                      ? `${template.mediaCount}→${selectedMedia.length}`
                      : `${template.mediaCount} items`}
                  </span>
                </div>
              </div>

              {/* Text overlay preview */}
              {template.defaultTexts.length > 0 && (
                <div className="mt-2 flex items-center gap-1.5">
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" className="text-text-muted" strokeWidth="2">
                    <path d="M4 7V4h16v3" />
                    <path d="M9 20h6" />
                    <path d="M12 4v16" />
                  </svg>
                  <span className="text-[10px] text-text-muted truncate">
                    {template.defaultTexts.map(t => `"${t.text}"`).join(' · ')}
                  </span>
                </div>
              )}
            </button>
          );
        })}
      </div>

      {/* Timeline Visualization (shown when a template is selected) */}
      {activeTemplate && (
        <TimelineVisualization template={activeTemplate} media={media} />
      )}

      {/* Text Overlay Editor */}
      {activeTemplate && activeTemplate.defaultTexts.length > 0 && (
        <TextOverlayEditor
          template={activeTemplate}
          textOverrides={textOverrides}
          onTextOverridesChange={onTextOverridesChange}
        />
      )}

      {/* Template Mixer — customize effects */}
      {activeTemplate && (
        <div>
          {!showMixer ? (
            <button
              onClick={() => setShowMixer(true)}
              className={`w-full card-glow p-4 text-left flex items-center justify-between group hover:border-accent-gold/30 transition-colors ${
                hasOverrides ? 'border-accent-gold/20' : ''
              }`}
            >
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-accent-gold/10 flex items-center justify-center">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" className="text-accent-gold" strokeWidth="2">
                    <line x1="4" y1="21" x2="4" y2="14" />
                    <line x1="4" y1="10" x2="4" y2="3" />
                    <line x1="12" y1="21" x2="12" y2="12" />
                    <line x1="12" y1="8" x2="12" y2="3" />
                    <line x1="20" y1="21" x2="20" y2="16" />
                    <line x1="20" y1="12" x2="20" y2="3" />
                    <line x1="1" y1="14" x2="7" y2="14" />
                    <line x1="9" y1="8" x2="15" y2="8" />
                    <line x1="17" y1="16" x2="23" y2="16" />
                  </svg>
                </div>
                <div>
                  <p className="text-sm font-bold text-white">Customize Effects</p>
                  <p className="text-xs text-text-muted">
                    {hasOverrides ? 'Custom effects applied — tap to edit' : 'Mix motions, transitions, color grades & more'}
                  </p>
                </div>
              </div>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" className="text-text-muted group-hover:text-white transition-colors" strokeWidth="2">
                <polyline points="9 18 15 12 9 6" />
              </svg>
            </button>
          ) : (
            <TemplateMixer
              overrides={mixerOverrides}
              onOverridesChange={onMixerOverridesChange}
              onClose={() => setShowMixer(false)}
            />
          )}
        </div>
      )}

      {/* Aspect Ratio */}
      <div className="card-glow p-5">
        <h3 className="text-sm font-bold text-text-muted uppercase tracking-wider mb-3">
          Aspect Ratio
        </h3>
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
              <span className="block text-lg mb-0.5" aria-hidden="true">
                {opt.icon}
              </span>
              {opt.label}
            </button>
          ))}
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
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <line x1="5" y1="12" x2="19" y2="12" />
            <polyline points="12 5 19 12 12 19" />
          </svg>
        </button>
      </div>
    </div>
  );
}
