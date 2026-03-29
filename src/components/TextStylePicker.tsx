'use client';

import { useState, useEffect } from 'react';
import { TEXT_STYLE_PRESETS, getTextStyleCategories, type TextStylePreset } from '@/lib/text-styles';
import { loadFont } from '@/lib/fonts';

interface TextStylePickerProps {
  selectedStyleId: string | null;
  onSelectStyle: (styleId: string) => void;
  previewText?: string;
  onClose?: () => void;
}

const CATEGORY_LABELS: Record<string, { label: string; emoji: string }> = {
  bold: { label: 'Bold', emoji: '💪' },
  elegant: { label: 'Elegant', emoji: '✨' },
  neon: { label: 'Neon', emoji: '💡' },
  retro: { label: 'Retro', emoji: '📼' },
  minimal: { label: 'Minimal', emoji: '🎯' },
  fun: { label: 'Fun', emoji: '🎉' },
};

export default function TextStylePicker({
  selectedStyleId,
  onSelectStyle,
  previewText = 'PhotoForge',
  onClose,
}: TextStylePickerProps) {
  const [activeCategory, setActiveCategory] = useState<string>('bold');
  const categories = getTextStyleCategories();

  // Load fonts for visible presets
  useEffect(() => {
    const cat = categories.find((c) => c.category === activeCategory);
    if (cat) {
      cat.presets.forEach((p) => loadFont(p.fontFamily));
    }
  }, [activeCategory]);

  const getPreviewStyle = (preset: TextStylePreset): React.CSSProperties => {
    const style: React.CSSProperties = {
      fontFamily: `"${preset.fontFamily}", system-ui, sans-serif`,
      fontWeight: preset.fontWeight,
      color: preset.color,
      fontSize: '16px',
      letterSpacing: preset.letterSpacing ? `${preset.letterSpacing}em` : undefined,
      textTransform: preset.textTransform as React.CSSProperties['textTransform'],
      lineHeight: 1.2,
    };

    // Glow
    if (preset.glowColor) {
      style.textShadow = `0 0 ${preset.glowSize || 15}px ${preset.glowColor}`;
    }

    // Drop shadow
    if (preset.dropShadow) {
      const ds = preset.dropShadow;
      const shadowStr = `${ds.x}px ${ds.y}px ${ds.blur}px ${ds.color}`;
      style.textShadow = style.textShadow
        ? `${style.textShadow}, ${shadowStr}`
        : shadowStr;
    }

    // Stroke
    if (preset.stroke) {
      const s = preset.stroke;
      (style as Record<string, unknown>)['-webkit-text-stroke'] = `${s.width}px ${s.color}`;
    }

    return style;
  };

  const getBackgroundStyle = (preset: TextStylePreset): React.CSSProperties | undefined => {
    if (!preset.background) return undefined;
    const bg = preset.background;
    return {
      background: bg.glass
        ? 'rgba(255,255,255,0.08)'
        : bg.color,
      padding: `${bg.paddingY}px ${bg.paddingX}px`,
      borderRadius: bg.borderRadius,
      backdropFilter: bg.glass ? 'blur(10px)' : undefined,
      border: bg.glass ? '1px solid rgba(255,255,255,0.1)' : undefined,
    };
  };

  return (
    <div className="card-glow overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-border-subtle">
        <h3 className="text-sm font-bold text-white">Text Style</h3>
        {onClose && (
          <button
            onClick={onClose}
            className="text-text-muted hover:text-white transition-colors p-1"
            aria-label="Close"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        )}
      </div>

      {/* Category tabs */}
      <div className="flex gap-1 px-4 pt-3 pb-2 overflow-x-auto">
        {categories.map(({ category }) => {
          const meta = CATEGORY_LABELS[category] || { label: category, emoji: '' };
          return (
            <button
              key={category}
              onClick={() => setActiveCategory(category)}
              className={`px-3 py-1.5 rounded-md text-xs font-medium whitespace-nowrap transition-colors ${
                activeCategory === category
                  ? 'bg-accent-gold/15 text-accent-gold border border-accent-gold/30'
                  : 'text-text-muted hover:text-white hover:bg-white/5'
              }`}
            >
              {meta.emoji} {meta.label}
            </button>
          );
        })}
      </div>

      {/* Style grid */}
      <div className="px-4 pb-4 grid grid-cols-2 gap-2 max-h-64 overflow-y-auto">
        {categories
          .find((c) => c.category === activeCategory)
          ?.presets.map((preset) => {
            const isSelected = selectedStyleId === preset.id;
            return (
              <button
                key={preset.id}
                onClick={() => onSelectStyle(preset.id)}
                className={`rounded-lg overflow-hidden transition-all ${
                  isSelected
                    ? 'ring-2 ring-accent-gold shadow-gold-sm'
                    : 'ring-1 ring-border-subtle hover:ring-white/20'
                }`}
              >
                {/* Preview area */}
                <div className="h-16 bg-bg-main flex items-center justify-center px-3 overflow-hidden">
                  <div style={getBackgroundStyle(preset)}>
                    <span style={getPreviewStyle(preset)} className="truncate block max-w-full">
                      {previewText}
                    </span>
                  </div>
                </div>
                {/* Name */}
                <div className={`px-2 py-1.5 text-[10px] font-medium text-center ${
                  isSelected ? 'bg-accent-gold/10 text-accent-gold' : 'bg-bg-card text-text-muted'
                }`}>
                  {preset.name}
                </div>
              </button>
            );
          })}
      </div>
    </div>
  );
}
