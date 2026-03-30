'use client';

import { useState, useEffect, useMemo } from 'react';
import { SMART_TEMPLATES, assignMediaToSlots, formatDuration } from '@/lib/templates';
import { getParticleCSS } from '@/lib/particles';
import { MediaFile, SmartTemplate, TextOverlay, TextOverlayOverride, TextBackdrop } from '@/types';
import { resolveTextOverlay, getTextAnimationCSS, getBackdropPreviewCSS } from '@/lib/text-renderer';
import TemplateMixer, { type MixerOverrides } from '@/components/TemplateMixer';

interface TemplateStepProps {
  selectedTemplate: string | null;
  onSelectTemplate: (id: string) => void;
  media: MediaFile[];
  aspectRatio: '16:9' | '9:16' | '1:1';
  onAspectChange: (a: '16:9' | '9:16' | '1:1') => void;
  onNext: () => void;
  onBack: () => void;
  textOverrides: Record<number, TextOverlayOverride>;
  onTextOverridesChange: (overrides: Record<number, TextOverlayOverride>) => void;
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
  textOverrides,
}: {
  template: SmartTemplate;
  media: MediaFile[];
  textOverrides: Record<number, TextOverlayOverride>;
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

              {/* Text overlay indicator */}
              {((slot.textOverlay && textOverrides[i] !== null) ||
                (!slot.textOverlay && textOverrides[i] && typeof textOverrides[i] === 'object' && textOverrides[i] !== null)) && (
                <div
                  className="absolute top-1.5 right-0.5 z-10 w-3 h-3 rounded-sm bg-accent-gold/80 flex items-center justify-center"
                  title="Has text overlay"
                >
                  <span className="text-[6px] font-black text-black leading-none">T</span>
                </div>
              )}

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
                {slot.textOverlay && textOverrides[i] !== null && (
                  <p className="text-[9px] text-accent-gold/80 truncate max-w-[120px]">
                    T: &ldquo;{(() => {
                      const resolved = resolveTextOverlay(slot.textOverlay!, textOverrides[i]);
                      return resolved ? resolved.text : slot.textOverlay!.text;
                    })()}&rdquo;
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
/*  Constants for text overlay controls                                */
/* ------------------------------------------------------------------ */

const FONT_SIZE_OPTIONS: { value: TextOverlay['fontSize']; label: string; preview: string }[] = [
  { value: 'sm', label: 'Small', preview: 'Aa' },
  { value: 'md', label: 'Medium', preview: 'Aa' },
  { value: 'lg', label: 'Large', preview: 'Aa' },
  { value: 'xl', label: 'XL', preview: 'Aa' },
];

const ANIMATION_OPTIONS: { value: TextOverlay['animation']; label: string; icon: string }[] = [
  { value: 'fade-in', label: 'Fade', icon: '◐' },
  { value: 'slide-up', label: 'Slide Up', icon: '↑' },
  { value: 'typewriter', label: 'Typewriter', icon: '⌨' },
  { value: 'scale-pop', label: 'Pop', icon: '💥' },
  { value: 'glitch-in', label: 'Glitch', icon: '⚡' },
  { value: 'blur-in', label: 'Blur In', icon: '◉' },
  { value: 'bounce-in', label: 'Bounce', icon: '⤴' },
  { value: 'wave', label: 'Wave', icon: '〰' },
  { value: 'neon-flicker', label: 'Neon', icon: '💡' },
  { value: 'none', label: 'Static', icon: '—' },
];

const BACKDROP_OPTIONS: { value: TextBackdrop; label: string; icon: string }[] = [
  { value: 'none', label: 'Default', icon: '▬' },
  { value: 'pill', label: 'Pill', icon: '💊' },
  { value: 'glass', label: 'Glass', icon: '❄' },
  { value: 'neon-box', label: 'Neon Box', icon: '⬡' },
  { value: 'gradient-bar', label: 'Gradient', icon: '▰' },
  { value: 'cinematic-bar', label: 'Cinema', icon: '🎬' },
  { value: 'tag', label: 'Tag', icon: '🏷' },
  { value: 'outline', label: 'Outline', icon: '□' },
  { value: 'shadow-block', label: 'Shadow', icon: '▣' },
];

const POSITION_OPTIONS: { value: TextOverlay['position']; label: string }[] = [
  { value: 'top', label: 'Top' },
  { value: 'center', label: 'Center' },
  { value: 'bottom', label: 'Bottom' },
];

const WEIGHT_OPTIONS: { value: TextOverlay['fontWeight']; label: string }[] = [
  { value: 'normal', label: 'Regular' },
  { value: 'bold', label: 'Bold' },
  { value: 'black', label: 'Black' },
];

const COLOR_PRESETS = [
  '#ffffff', '#FFD700', '#FF6B00', '#FF3366',
  '#00FFAA', '#00BFFF', '#A855F7', '#000000',
];

/* ------------------------------------------------------------------ */
/*  Text Overlay Editor (Enhanced)                                     */
/* ------------------------------------------------------------------ */
function TextOverlayEditor({
  template,
  media,
  textOverrides,
  onTextOverridesChange,
}: {
  template: SmartTemplate;
  media: MediaFile[];
  textOverrides: Record<number, TextOverlayOverride>;
  onTextOverridesChange: (overrides: Record<number, TextOverlayOverride>) => void;
}) {
  const [expandedSlot, setExpandedSlot] = useState<number | null>(null);
  const [showAddPicker, setShowAddPicker] = useState(false);

  // Find all slots that have textOverlay (either from template or user-added)
  const textSlots = template.slots
    .map((slot, i) => ({ slot, index: i }))
    .filter(({ slot, index }) => {
      // Has original text overlay and not removed
      if (slot.textOverlay && textOverrides[index] !== null) return true;
      // User added a text overlay to this slot
      if (!slot.textOverlay && textOverrides[index] && typeof textOverrides[index] === 'object' && textOverrides[index] !== null) return true;
      return false;
    });

  // Slots without text (for "Add Text" picker)
  const emptySlots = template.slots
    .map((_, i) => i)
    .filter(i => {
      const slot = template.slots[i];
      if (slot.textOverlay && textOverrides[i] !== null) return false;
      if (textOverrides[i] && typeof textOverrides[i] === 'object' && textOverrides[i] !== null) return false;
      return true;
    });

  // Also include removed slots
  const removedSlots = template.slots
    .map((slot, i) => ({ slot, index: i }))
    .filter(({ slot, index }) => slot.textOverlay && textOverrides[index] === null);

  const selectedMedia = media.filter(m => m.selected);
  const slotAssignments = assignMediaToSlots(template, selectedMedia.map(m => m.id));
  const mediaById = new Map<string, MediaFile>();
  selectedMedia.forEach(m => mediaById.set(m.id, m));

  /** Get the resolved overlay for a slot index */
  const getResolved = (index: number): TextOverlay | null => {
    const base = template.slots[index]?.textOverlay;
    const override = textOverrides[index];

    // User-added text (no base, override is a full object)
    if (!base && override && typeof override === 'object' && override !== null) {
      const defaults: TextOverlay = {
        text: 'Your Text', position: 'center', fontSize: 'lg',
        fontWeight: 'bold', animation: 'fade-in', color: '#ffffff',
      };
      return { ...defaults, ...override } as TextOverlay;
    }

    if (!base) return null;
    return resolveTextOverlay(base, override);
  };

  /** Update a specific property of a text overlay override */
  const updateOverride = (index: number, patch: Partial<TextOverlay>) => {
    const existing = textOverrides[index];
    if (existing === null) return; // removed

    if (existing === undefined || typeof existing === 'string') {
      // Upgrade from legacy string to full object
      const base = template.slots[index]?.textOverlay;
      const textValue = typeof existing === 'string' ? existing : undefined;
      onTextOverridesChange({
        ...textOverrides,
        [index]: { ...(textValue !== undefined ? { text: textValue } : {}), ...patch },
      });
    } else {
      // Already an object — merge
      onTextOverridesChange({
        ...textOverrides,
        [index]: { ...existing, ...patch },
      });
    }
  };

  /** Add a new text overlay to a slot */
  const addTextToSlot = (index: number) => {
    onTextOverridesChange({
      ...textOverrides,
      [index]: {
        text: 'Your Text',
        position: 'center' as const,
        fontSize: 'lg' as const,
        fontWeight: 'bold' as const,
        animation: 'fade-in' as const,
        color: '#ffffff',
      },
    });
    setExpandedSlot(index);
    setShowAddPicker(false);
  };

  /** Remove a text overlay from a slot */
  const removeText = (index: number) => {
    if (template.slots[index]?.textOverlay) {
      // Has base — mark as null to hide
      onTextOverridesChange({ ...textOverrides, [index]: null });
    } else {
      // User-added — delete entirely
      const next = { ...textOverrides };
      delete next[index];
      onTextOverridesChange(next);
    }
    if (expandedSlot === index) setExpandedSlot(null);
  };

  /** Restore a removed text */
  const restoreText = (index: number) => {
    const next = { ...textOverrides };
    delete next[index];
    onTextOverridesChange(next);
  };

  const totalTexts = textSlots.length + removedSlots.length;
  if (totalTexts === 0 && template.defaultTexts.length === 0 && emptySlots.length === 0) return null;

  return (
    <div className="card-glow p-5">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-bold text-white flex items-center gap-2">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" className="text-accent-gold" strokeWidth="2">
            <path d="M4 7V4h16v3" />
            <path d="M9 20h6" />
            <path d="M12 4v16" />
          </svg>
          Text Overlays
        </h3>
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-text-muted">
            {textSlots.length} active
          </span>
          <button
            onClick={() => setShowAddPicker(!showAddPicker)}
            className="text-[10px] bg-accent-gold/10 text-accent-gold border border-accent-gold/30 px-2 py-0.5 rounded hover:bg-accent-gold/20 transition-colors flex items-center gap-1"
          >
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            Add Text
          </button>
        </div>
      </div>

      {/* Add text to slot picker */}
      {showAddPicker && (
        <div className="mb-4 p-3 bg-bg-input/50 border border-accent-gold/20 rounded-lg">
          <p className="text-[10px] text-text-muted mb-2">Choose a slot to add text to:</p>
          <div className="flex flex-wrap gap-1.5">
            {emptySlots.length === 0 ? (
              <span className="text-[10px] text-text-muted italic">All slots have text</span>
            ) : (
              emptySlots.map(i => {
                const assignedMedia = mediaById.get(slotAssignments[i] || '');
                return (
                  <button
                    key={i}
                    onClick={() => addTextToSlot(i)}
                    className="text-[10px] bg-bg-card border border-border-subtle rounded px-2 py-1.5 hover:border-accent-gold/40 hover:bg-accent-gold/5 transition-colors flex items-center gap-1.5"
                    title={assignedMedia ? assignedMedia.name : `Slot ${i + 1}`}
                  >
                    <span className="font-mono text-text-muted">#{i + 1}</span>
                    {assignedMedia && (
                      <span className="text-white/60 truncate max-w-[80px]">{assignedMedia.name.split('.')[0]}</span>
                    )}
                  </button>
                );
              })
            )}
          </div>
          <button
            onClick={() => setShowAddPicker(false)}
            className="text-[10px] text-text-muted hover:text-white mt-2"
          >
            Cancel
          </button>
        </div>
      )}

      {/* Active text overlays */}
      <div className="space-y-2">
        {textSlots.map(({ index }) => {
          const resolved = getResolved(index);
          if (!resolved) return null;
          const isExpanded = expandedSlot === index;
          const assignedMedia = mediaById.get(slotAssignments[index] || '');
          const thumbSrc = assignedMedia
            ? assignedMedia.type === 'video'
              ? assignedMedia.thumbnailUrl || assignedMedia.url
              : assignedMedia.url
            : null;

          return (
            <div key={index} className="border border-border-subtle rounded-lg overflow-hidden bg-bg-card/50">
              {/* Compact row — always visible */}
              <div
                className="flex items-center gap-2 p-2 cursor-pointer hover:bg-white/[0.02] transition-colors"
                onClick={() => setExpandedSlot(isExpanded ? null : index)}
              >
                {/* Mini preview */}
                <div
                  className="w-16 h-10 rounded overflow-hidden bg-black shrink-0 relative"
                  title={`Slot ${index + 1}`}
                >
                  {thumbSrc ? (
                    <img src={thumbSrc} alt="" className="w-full h-full object-cover opacity-60" />
                  ) : (
                    <div className="w-full h-full bg-gradient-to-br from-bg-hover to-bg-card" />
                  )}
                  {/* Position indicator */}
                  <div
                    className="absolute left-1/2 -translate-x-1/2 px-1 text-center"
                    style={{
                      top: resolved.position === 'top' ? '10%'
                        : resolved.position === 'bottom' ? 'auto'
                        : '50%',
                      bottom: resolved.position === 'bottom' ? '10%' : 'auto',
                      transform: resolved.position === 'center'
                        ? 'translate(-50%, -50%)'
                        : 'translateX(-50%)',
                      fontSize: '6px',
                      fontWeight: resolved.fontWeight === 'black' ? 900 : resolved.fontWeight === 'bold' ? 700 : 400,
                      color: resolved.color,
                      textShadow: '0 1px 2px rgba(0,0,0,0.9)',
                      lineHeight: 1,
                      whiteSpace: 'nowrap',
                      maxWidth: '90%',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}
                  >
                    {resolved.text.slice(0, 15)}{resolved.text.length > 15 ? '…' : ''}
                  </div>
                </div>

                {/* Slot number */}
                <span className="text-[10px] font-mono text-text-muted bg-bg-input px-1.5 py-0.5 rounded shrink-0">
                  #{index + 1}
                </span>

                {/* Text content */}
                <span className="text-xs text-white truncate flex-1 min-w-0">
                  {resolved.text}
                </span>

                {/* Property badges */}
                <div className="hidden sm:flex items-center gap-1 shrink-0">
                  <span className="text-[8px] font-mono text-accent-gold/50 bg-accent-gold/5 px-1 py-0.5 rounded">
                    {resolved.fontSize.toUpperCase()}
                  </span>
                  <span className="text-[8px] font-mono text-accent-gold/50 bg-accent-gold/5 px-1 py-0.5 rounded">
                    {resolved.animation === 'none' ? 'static' : resolved.animation}
                  </span>
                  <span className="text-[8px] font-mono text-text-muted/50 px-1 py-0.5">
                    {resolved.position}
                  </span>
                </div>

                {/* Expand arrow */}
                <svg
                  width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                  className={`text-text-muted shrink-0 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                  strokeWidth="2"
                >
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              </div>

              {/* Expanded editor */}
              {isExpanded && (
                <div className="border-t border-border-subtle p-3 space-y-3">
                  {/* Text input */}
                  <div>
                    <label className="text-[10px] text-text-muted uppercase tracking-wider block mb-1">Text</label>
                    <input
                      type="text"
                      value={resolved.text}
                      onChange={(e) => updateOverride(index, { text: e.target.value })}
                      placeholder="Enter text..."
                      className="w-full px-3 py-2 bg-bg-input border border-border-subtle rounded-lg text-sm text-white placeholder:text-text-muted focus:border-accent-gold focus:outline-none"
                    />
                  </div>

                  {/* Font Size */}
                  <div>
                    <label className="text-[10px] text-text-muted uppercase tracking-wider block mb-1.5">Size</label>
                    <div className="flex gap-1.5">
                      {FONT_SIZE_OPTIONS.map(opt => (
                        <button
                          key={opt.value}
                          onClick={() => updateOverride(index, { fontSize: opt.value })}
                          className={`flex-1 py-1.5 rounded-md text-center transition-all border ${
                            resolved.fontSize === opt.value
                              ? 'bg-accent-gold/15 border-accent-gold/40 text-accent-gold'
                              : 'bg-bg-input border-border-subtle text-text-muted hover:text-white hover:border-white/20'
                          }`}
                        >
                          <span
                            className="block leading-none"
                            style={{
                              fontSize: opt.value === 'sm' ? '10px' : opt.value === 'md' ? '12px' : opt.value === 'lg' ? '15px' : '18px',
                              fontWeight: 700,
                            }}
                          >
                            {opt.preview}
                          </span>
                          <span className="text-[8px] opacity-60 block mt-0.5">{opt.label}</span>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Weight */}
                  <div>
                    <label className="text-[10px] text-text-muted uppercase tracking-wider block mb-1.5">Weight</label>
                    <div className="flex gap-1.5">
                      {WEIGHT_OPTIONS.map(opt => (
                        <button
                          key={opt.value}
                          onClick={() => updateOverride(index, { fontWeight: opt.value })}
                          className={`flex-1 py-1.5 rounded-md text-xs transition-all border ${
                            resolved.fontWeight === opt.value
                              ? 'bg-accent-gold/15 border-accent-gold/40 text-accent-gold'
                              : 'bg-bg-input border-border-subtle text-text-muted hover:text-white hover:border-white/20'
                          }`}
                          style={{ fontWeight: opt.value === 'normal' ? 400 : opt.value === 'bold' ? 700 : 900 }}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Position */}
                  <div>
                    <label className="text-[10px] text-text-muted uppercase tracking-wider block mb-1.5">Position</label>
                    <div className="flex gap-1.5">
                      {POSITION_OPTIONS.map(opt => (
                        <button
                          key={opt.value}
                          onClick={() => updateOverride(index, { position: opt.value })}
                          className={`flex-1 py-1.5 rounded-md text-xs transition-all border ${
                            resolved.position === opt.value
                              ? 'bg-accent-gold/15 border-accent-gold/40 text-accent-gold'
                              : 'bg-bg-input border-border-subtle text-text-muted hover:text-white hover:border-white/20'
                          }`}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Animation */}
                  <div>
                    <label className="text-[10px] text-text-muted uppercase tracking-wider block mb-1.5">Animation</label>
                    <div className="grid grid-cols-5 gap-1.5">
                      {ANIMATION_OPTIONS.map(opt => (
                        <button
                          key={opt.value}
                          onClick={() => updateOverride(index, { animation: opt.value })}
                          className={`py-1.5 rounded-md text-center transition-all border ${
                            resolved.animation === opt.value
                              ? 'bg-accent-gold/15 border-accent-gold/40 text-accent-gold'
                              : 'bg-bg-input border-border-subtle text-text-muted hover:text-white hover:border-white/20'
                          }`}
                        >
                          <span className="text-sm block leading-none">{opt.icon}</span>
                          <span className="text-[8px] block mt-0.5">{opt.label}</span>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Backdrop / Container */}
                  <div>
                    <label className="text-[10px] text-text-muted uppercase tracking-wider block mb-1.5">Backdrop</label>
                    <div className="grid grid-cols-5 gap-1.5">
                      {BACKDROP_OPTIONS.map(opt => (
                        <button
                          key={opt.value}
                          onClick={() => updateOverride(index, { backdrop: opt.value })}
                          className={`py-1.5 rounded-md text-center transition-all border ${
                            (resolved.backdrop || 'none') === opt.value
                              ? 'bg-accent-gold/15 border-accent-gold/40 text-accent-gold'
                              : 'bg-bg-input border-border-subtle text-text-muted hover:text-white hover:border-white/20'
                          }`}
                        >
                          <span className="text-sm block leading-none">{opt.icon}</span>
                          <span className="text-[7px] block mt-0.5">{opt.label}</span>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Color */}
                  <div>
                    <label className="text-[10px] text-text-muted uppercase tracking-wider block mb-1.5">Color</label>
                    <div className="flex items-center gap-2">
                      <div className="flex gap-1.5">
                        {COLOR_PRESETS.map(c => (
                          <button
                            key={c}
                            onClick={() => updateOverride(index, { color: c })}
                            className={`w-6 h-6 rounded-full border-2 transition-all ${
                              resolved.color.toLowerCase() === c.toLowerCase()
                                ? 'border-accent-gold scale-110'
                                : 'border-transparent hover:border-white/30'
                            }`}
                            style={{ background: c, boxShadow: c === '#000000' ? 'inset 0 0 0 1px rgba(255,255,255,0.2)' : undefined }}
                            title={c}
                          />
                        ))}
                      </div>
                      <input
                        type="color"
                        value={resolved.color}
                        onChange={(e) => updateOverride(index, { color: e.target.value })}
                        className="w-6 h-6 rounded cursor-pointer border border-border-subtle bg-transparent"
                        title="Custom color"
                      />
                    </div>
                  </div>

                  {/* Live mini-preview */}
                  <div>
                    <label className="text-[10px] text-text-muted uppercase tracking-wider block mb-1.5">Preview</label>
                    <div className="relative h-24 rounded-lg overflow-hidden bg-black">
                      {thumbSrc && (
                        <img src={thumbSrc} alt="" className="absolute inset-0 w-full h-full object-cover opacity-40" />
                      )}
                      {/* Backdrop container */}
                      <div
                        className="absolute left-1/2 text-center max-w-[95%]"
                        style={{
                          top: resolved.position === 'top' ? '15%'
                            : resolved.position === 'bottom' ? 'auto'
                            : '50%',
                          bottom: resolved.position === 'bottom' ? '15%' : 'auto',
                          transform: resolved.position === 'center'
                            ? 'translate(-50%, -50%)'
                            : 'translateX(-50%)',
                          ...((getBackdropPreviewCSS(resolved) ?? {}) as React.CSSProperties),
                        }}
                      >
                        <span
                          style={{
                            fontSize: resolved.fontSize === 'xl' ? '18px'
                              : resolved.fontSize === 'lg' ? '14px'
                              : resolved.fontSize === 'md' ? '11px' : '9px',
                            fontWeight: resolved.fontWeight === 'black' ? 900
                              : resolved.fontWeight === 'bold' ? 700 : 400,
                            color: resolved.backdrop === 'tag' ? undefined : resolved.color,
                            textShadow: resolved.glowColor
                              ? `0 0 8px ${resolved.glowColor}`
                              : resolved.backdrop === 'tag' ? 'none' : '0 1px 3px rgba(0,0,0,0.9)',
                            letterSpacing: resolved.fontWeight === 'black' ? '0.05em' : '0.02em',
                            textTransform: resolved.fontWeight === 'black' ? 'uppercase' as const : 'none' as const,
                            whiteSpace: 'nowrap' as const,
                            overflow: 'hidden' as const,
                            textOverflow: 'ellipsis' as const,
                          }}
                        >
                          {resolved.text || 'Your Text'}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Remove button */}
                  <button
                    onClick={() => removeText(index)}
                    className="text-[10px] text-red-400/70 hover:text-red-400 hover:bg-red-400/10 px-2 py-1 rounded transition-colors flex items-center gap-1"
                  >
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                    </svg>
                    Remove text from this slot
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Removed overlays — offer restore */}
      {removedSlots.length > 0 && (
        <div className="mt-3 pt-3 border-t border-border-subtle">
          <p className="text-[10px] text-text-muted mb-2">Removed:</p>
          <div className="flex flex-wrap gap-1.5">
            {removedSlots.map(({ slot, index }) => (
              <button
                key={index}
                onClick={() => restoreText(index)}
                className="text-[10px] text-text-muted/60 bg-bg-input/50 border border-border-subtle rounded px-2 py-1 hover:text-accent-gold hover:border-accent-gold/30 transition-colors flex items-center gap-1"
              >
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M3 12a9 9 0 1 0 9-9 9 9 0 0 0-9 9" />
                  <polyline points="12 8 12 12 14 14" />
                </svg>
                Slot {index + 1}: &ldquo;{slot.textOverlay?.text}&rdquo;
              </button>
            ))}
          </div>
        </div>
      )}

      <p className="text-[10px] text-text-muted mt-3">
        Tap a text to expand controls. Add text to any slot with the + button.
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

  // Inject text animation CSS on mount
  useEffect(() => {
    const styleId = 'text-overlay-animations';
    if (!document.getElementById(styleId)) {
      const style = document.createElement('style');
      style.id = styleId;
      style.textContent = getTextAnimationCSS();
      document.head.appendChild(style);
    }
  }, []);

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
        <TimelineVisualization template={activeTemplate} media={media} textOverrides={textOverrides} />
      )}

      {/* Text Overlay Editor */}
      {activeTemplate && (
        <TextOverlayEditor
          template={activeTemplate}
          media={media}
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
