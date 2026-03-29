'use client';

import { useState } from 'react';
import { MOTION_MAP } from '@/lib/effects/motions';
import { TRANSITION_MAP } from '@/lib/effects/transitions';
import { POST_EFFECT_MAP } from '@/lib/effects/post-processing';
import { SPEED_PRESETS } from '@/lib/effects/speed-ramp';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface MixerOverrides {
  /** Override motion effect for all slots */
  motion?: string;
  /** Override transition for all slots */
  transition?: string;
  /** Post-processing effects to add */
  postEffects?: { effect: string; intensity: number }[];
  /** Speed curve preset name */
  speedPreset?: string;
  /** Color grade preset name */
  colorGrade?: string;
  /** Global motion intensity (0-1) */
  motionIntensity?: number;
}

interface TemplateMixerProps {
  overrides: MixerOverrides;
  onOverridesChange: (overrides: MixerOverrides) => void;
  onClose: () => void;
}

// ---------------------------------------------------------------------------
// Data: Available options for each layer
// ---------------------------------------------------------------------------

const MOTION_OPTIONS: { value: string; label: string; category: string }[] = [
  // Camera
  { value: 'dolly-in', label: 'Dolly In', category: 'Camera' },
  { value: 'dolly-out', label: 'Dolly Out', category: 'Camera' },
  { value: 'orbit', label: 'Orbit', category: 'Camera' },
  { value: 'crane-up', label: 'Crane Up', category: 'Camera' },
  { value: 'crane-down', label: 'Crane Down', category: 'Camera' },
  { value: 'whip-pan', label: 'Whip Pan', category: 'Camera' },
  { value: 'rack-focus', label: 'Rack Focus', category: 'Camera' },
  // Dynamic
  { value: 'speed-ramp', label: 'Speed Ramp', category: 'Dynamic' },
  { value: 'pulse-zoom', label: 'Pulse Zoom', category: 'Dynamic' },
  { value: 'drift', label: 'Drift', category: 'Dynamic' },
  { value: 'tilt-shift', label: 'Tilt Shift', category: 'Dynamic' },
  // Film
  { value: 'bloom', label: 'Bloom', category: 'Film' },
  { value: 'lens-flare', label: 'Lens Flare', category: 'Film' },
  { value: 'light-leak', label: 'Light Leak', category: 'Film' },
  // Clone
  { value: 'mirror', label: 'Mirror', category: 'Clone' },
  { value: 'pixelate-reveal', label: 'Pixelate Reveal', category: 'Clone' },
  // Legacy
  { value: 'ken-burns', label: 'Ken Burns', category: 'Classic' },
  { value: 'parallax', label: 'Parallax', category: 'Classic' },
  { value: 'slow-zoom', label: 'Slow Zoom', category: 'Classic' },
  { value: 'pan-left', label: 'Pan Left', category: 'Classic' },
  { value: 'pan-right', label: 'Pan Right', category: 'Classic' },
  { value: 'bounce', label: 'Bounce', category: 'Classic' },
  { value: 'static', label: 'Static', category: 'Classic' },
];

const TRANSITION_OPTIONS: { value: string; label: string; category: string }[] = [
  { value: 'morph-dissolve', label: 'Morph Dissolve', category: 'Warp' },
  { value: 'radial-wipe', label: 'Radial Wipe', category: 'Warp' },
  { value: 'clock-wipe', label: 'Clock Wipe', category: 'Warp' },
  { value: 'iris-wipe', label: 'Iris Wipe', category: 'Warp' },
  { value: 'curtain', label: 'Curtain', category: 'Warp' },
  { value: 'page-curl', label: 'Page Curl', category: '3D' },
  { value: 'cube-rotate', label: 'Cube Rotate', category: '3D' },
  { value: 'flip-card', label: 'Flip Card', category: '3D' },
  { value: 'shatter', label: 'Shatter', category: '3D' },
  { value: 'swirl', label: 'Swirl', category: '3D' },
  { value: 'whip-blur', label: 'Whip Blur', category: 'Energy' },
  { value: 'flash-white', label: 'Flash White', category: 'Energy' },
  { value: 'flash-black', label: 'Flash Black', category: 'Energy' },
  { value: 'glitch-blocks', label: 'Glitch Blocks', category: 'Energy' },
  { value: 'pixelate-crossfade', label: 'Pixelate', category: 'Energy' },
  { value: 'fade', label: 'Fade', category: 'Classic' },
  { value: 'slide-left', label: 'Slide Left', category: 'Classic' },
  { value: 'slide-right', label: 'Slide Right', category: 'Classic' },
  { value: 'zoom-in', label: 'Zoom In', category: 'Classic' },
  { value: 'zoom-out', label: 'Zoom Out', category: 'Classic' },
  { value: 'none', label: 'None', category: 'Classic' },
];

const POST_EFFECT_OPTIONS: { value: string; label: string }[] = [
  { value: 'color-grade', label: 'Color Grade' },
  { value: 'film-grain', label: 'Film Grain' },
  { value: 'chromatic-aberration', label: 'Chromatic Aberration' },
  { value: 'bloom', label: 'Bloom' },
  { value: 'vignette', label: 'Vignette' },
  { value: 'vignette-pulse', label: 'Vignette Pulse' },
  { value: 'letterbox', label: 'Letterbox' },
  { value: 'scanlines', label: 'Scanlines' },
  { value: 'light-leak', label: 'Light Leak' },
  { value: 'lens-flare', label: 'Lens Flare' },
  { value: 'motion-blur', label: 'Motion Blur' },
];

const SPEED_OPTIONS: { value: string; label: string; desc: string }[] = [
  { value: 'normal', label: 'Normal', desc: 'Constant speed' },
  { value: 'classic', label: 'Speed Ramp', desc: 'Slow → Fast → Slow' },
  { value: 'dramatic', label: 'Dramatic', desc: 'Very slow then burst' },
  { value: 'pulse', label: 'Pulse', desc: 'Rhythmic slow/fast' },
  { value: 'slow-mo', label: 'Slow Mo', desc: '0.3x speed throughout' },
  { value: 'accelerate', label: 'Accelerate', desc: 'Slow to fast' },
  { value: 'decelerate', label: 'Decelerate', desc: 'Fast to slow' },
];

const COLOR_GRADE_OPTIONS: { value: string; label: string; color: string }[] = [
  { value: 'none', label: 'None', color: '#888' },
  { value: 'warm-cinematic', label: 'Warm Cinema', color: '#FFB050' },
  { value: 'cool-teal', label: 'Cool Teal', color: '#00B4D8' },
  { value: 'vintage-fade', label: 'Vintage', color: '#C8B480' },
  { value: 'high-contrast', label: 'High Contrast', color: '#FFF' },
  { value: 'pastel-dream', label: 'Pastel Dream', color: '#C896FF' },
  { value: 'neon-night', label: 'Neon Night', color: '#6400FF' },
  { value: 'bleach-bypass', label: 'Bleach Bypass', color: '#999' },
];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function TemplateMixer({ overrides, onOverridesChange, onClose }: TemplateMixerProps) {
  const [activeTab, setActiveTab] = useState<'motion' | 'transition' | 'post' | 'speed' | 'color'>('motion');

  const update = (patch: Partial<MixerOverrides>) => {
    onOverridesChange({ ...overrides, ...patch });
  };

  const togglePostEffect = (effect: string) => {
    const current = overrides.postEffects || [];
    const exists = current.find((e) => e.effect === effect);
    if (exists) {
      update({ postEffects: current.filter((e) => e.effect !== effect) });
    } else {
      update({ postEffects: [...current, { effect, intensity: 0.5 }] });
    }
  };

  const setPostIntensity = (effect: string, intensity: number) => {
    const current = overrides.postEffects || [];
    update({
      postEffects: current.map((e) =>
        e.effect === effect ? { ...e, intensity } : e,
      ),
    });
  };

  const tabs = [
    { id: 'motion' as const, label: 'Motion', icon: '🎬' },
    { id: 'transition' as const, label: 'Transition', icon: '🔄' },
    { id: 'post' as const, label: 'Effects', icon: '✨' },
    { id: 'speed' as const, label: 'Speed', icon: '⚡' },
    { id: 'color' as const, label: 'Color', icon: '🎨' },
  ];

  return (
    <div className="card-glow overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-border-subtle">
        <div>
          <h3 className="text-sm font-bold text-white">Template Mixer</h3>
          <p className="text-[10px] text-text-muted">Customize effects across all slides</p>
        </div>
        <div className="flex items-center gap-2">
          {(overrides.motion || overrides.transition || overrides.postEffects?.length || overrides.speedPreset || overrides.colorGrade) && (
            <button
              onClick={() => onOverridesChange({})}
              className="text-[10px] text-red-400 hover:text-red-300 transition-colors px-2 py-1 rounded-md hover:bg-red-500/10"
            >
              Reset All
            </button>
          )}
          <button
            onClick={onClose}
            className="text-text-muted hover:text-white transition-colors p-1"
            aria-label="Close mixer"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-border-subtle">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex-1 px-2 py-2.5 text-[11px] font-medium transition-colors ${
              activeTab === tab.id
                ? 'text-accent-gold border-b-2 border-accent-gold'
                : 'text-text-muted hover:text-white'
            }`}
          >
            {tab.icon} {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="p-4 max-h-72 overflow-y-auto">
        {/* Motion tab */}
        {activeTab === 'motion' && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs text-text-muted">Override all slides:</span>
              {overrides.motion && (
                <button onClick={() => update({ motion: undefined })} className="text-[10px] text-red-400">
                  Clear
                </button>
              )}
            </div>
            <div className="grid grid-cols-3 gap-1.5">
              {MOTION_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => update({ motion: opt.value })}
                  className={`px-2 py-1.5 rounded text-[10px] font-medium transition-colors ${
                    overrides.motion === opt.value
                      ? 'bg-accent-gold/15 text-accent-gold border border-accent-gold/30'
                      : 'bg-white/5 text-text-muted hover:text-white hover:bg-white/10 border border-transparent'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            {/* Intensity slider */}
            <div className="pt-2">
              <label className="text-xs text-text-muted block mb-1">
                Intensity: {Math.round((overrides.motionIntensity ?? 0.7) * 100)}%
              </label>
              <input
                type="range"
                min="0"
                max="100"
                value={Math.round((overrides.motionIntensity ?? 0.7) * 100)}
                onChange={(e) => update({ motionIntensity: parseInt(e.target.value) / 100 })}
                className="w-full accent-accent-gold"
              />
            </div>
          </div>
        )}

        {/* Transition tab */}
        {activeTab === 'transition' && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs text-text-muted">Override all transitions:</span>
              {overrides.transition && (
                <button onClick={() => update({ transition: undefined })} className="text-[10px] text-red-400">
                  Clear
                </button>
              )}
            </div>
            <div className="grid grid-cols-3 gap-1.5">
              {TRANSITION_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => update({ transition: opt.value })}
                  className={`px-2 py-1.5 rounded text-[10px] font-medium transition-colors ${
                    overrides.transition === opt.value
                      ? 'bg-accent-gold/15 text-accent-gold border border-accent-gold/30'
                      : 'bg-white/5 text-text-muted hover:text-white hover:bg-white/10 border border-transparent'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Post-processing tab */}
        {activeTab === 'post' && (
          <div className="space-y-3">
            <span className="text-xs text-text-muted">Toggle post-processing effects:</span>
            <div className="space-y-2">
              {POST_EFFECT_OPTIONS.map((opt) => {
                const active = overrides.postEffects?.find((e) => e.effect === opt.value);
                return (
                  <div key={opt.value} className="flex items-center gap-3">
                    <button
                      onClick={() => togglePostEffect(opt.value)}
                      className={`flex-1 px-3 py-2 rounded text-xs font-medium text-left transition-colors ${
                        active
                          ? 'bg-accent-gold/15 text-accent-gold border border-accent-gold/30'
                          : 'bg-white/5 text-text-muted hover:text-white hover:bg-white/10 border border-transparent'
                      }`}
                    >
                      {opt.label}
                    </button>
                    {active && (
                      <input
                        type="range"
                        min="0"
                        max="100"
                        value={Math.round(active.intensity * 100)}
                        onChange={(e) =>
                          setPostIntensity(opt.value, parseInt(e.target.value) / 100)
                        }
                        className="w-20 accent-accent-gold"
                      />
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Speed tab */}
        {activeTab === 'speed' && (
          <div className="space-y-2">
            <span className="text-xs text-text-muted">Speed curve preset:</span>
            {SPEED_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => update({ speedPreset: opt.value === 'normal' ? undefined : opt.value })}
                className={`w-full px-3 py-2.5 rounded-lg text-left transition-colors ${
                  (overrides.speedPreset || 'normal') === opt.value
                    ? 'bg-accent-gold/15 text-accent-gold border border-accent-gold/30'
                    : 'bg-white/5 text-text-muted hover:text-white hover:bg-white/10 border border-transparent'
                }`}
              >
                <span className="text-xs font-medium">{opt.label}</span>
                <span className="text-[10px] text-text-muted ml-2">{opt.desc}</span>
              </button>
            ))}
          </div>
        )}

        {/* Color grade tab */}
        {activeTab === 'color' && (
          <div className="space-y-2">
            <span className="text-xs text-text-muted">Color grade:</span>
            <div className="grid grid-cols-2 gap-2">
              {COLOR_GRADE_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => update({ colorGrade: opt.value === 'none' ? undefined : opt.value })}
                  className={`px-3 py-2.5 rounded-lg flex items-center gap-2 transition-colors ${
                    (overrides.colorGrade || 'none') === opt.value
                      ? 'bg-accent-gold/15 text-accent-gold border border-accent-gold/30'
                      : 'bg-white/5 text-text-muted hover:text-white hover:bg-white/10 border border-transparent'
                  }`}
                >
                  <span
                    className="w-3 h-3 rounded-full border border-white/20"
                    style={{ backgroundColor: opt.color }}
                  />
                  <span className="text-xs font-medium">{opt.label}</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
