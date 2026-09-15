import { SmartTemplate, Template, TemplateSlot, TextOverlayOverride } from '@/types';
import type { ShotRole } from '@/types/library';

/**
 * Smart Templates v4 — pre-built timelines with the full v4 effects vocabulary.
 *
 * Each slot now supports:
 * - Any motion from MOTION_MAP (27 effects)
 * - Any transition from TRANSITION_MAP (23 transitions)
 * - Post-processing stacks (color grade, film grain, vignette, bloom, etc.)
 * - Speed curve presets
 * - Motion intensity + easing overrides
 * - Transition duration + easing overrides
 *
 * 12 themed templates across cinematic, dynamic, minimal, retro, glitch,
 * parallax, summer, winter, party, electric, golden, and neon styles.
 */
export const SMART_TEMPLATES: SmartTemplate[] = [
  // ─────────────────────────────────────────────────────────────────────────
  // 1. Cinematic Journey — slow, elegant hero shots
  // ─────────────────────────────────────────────────────────────────────────
  {
    id: 'cinematic-journey',
    name: 'Cinematic Journey',
    description: 'Slow, elegant. Long hero shots with gentle Ken Burns zoom. Perfect for travel or portraits.',
    style: 'cinematic',
    color: '#FFD700',
    totalDuration: 32,
    mediaCount: 8,
    emoji: '🎬',
    colorGrade: 'warm-cinematic',
    defaultSpeed: 'normal',
    theme: {
      bgColor: '#000',
      particles: 'none',
      particleDensity: 0,
      vignette: 0.3,
    },
    defaultTexts: [
      { text: 'Your Story', position: 'center', fontSize: 'xl', fontWeight: 'bold', animation: 'fade-in', color: '#fff' },
      { text: 'The End', position: 'center', fontSize: 'xl', fontWeight: 'bold', animation: 'fade-in', color: '#fff' },
    ],
    // Deliberate mix: 5 s hero slots take video moments, 3–4 s slots take photos (Phase 3).
    slots: [
      {
        slotType: 'video', duration: 5, transition: 'morphDissolve', effect: 'dolly-in', holdPoint: 'face',
        motionIntensity: 0.5, motionEasing: 'easeInOut', transitionDuration: 0.6,
        postEffects: [
          { effect: 'colorGrade', intensity: 0.7, params: { preset: 'warm-cinematic' } },
          { effect: 'vignette', intensity: 0.4 },
          { effect: 'letterbox', intensity: 0.8 },
        ],
        textOverlay: { text: 'Your Story', position: 'center', fontSize: 'xl', fontWeight: 'bold', animation: 'fade-in', color: '#fff' },
      },
      {
        slotType: 'photo', duration: 3, transition: 'fade', effect: 'crane-up', holdPoint: 'center',
        motionIntensity: 0.4, motionEasing: 'easeOut', transitionDuration: 0.8,
        postEffects: [
          { effect: 'colorGrade', intensity: 0.7, params: { preset: 'warm-cinematic' } },
          { effect: 'vignette', intensity: 0.3 },
          { effect: 'letterbox', intensity: 0.8 },
        ],
      },
      {
        slotType: 'photo', duration: 4, transition: 'fade', effect: 'drift', holdPoint: 'rule-of-thirds',
        motionIntensity: 0.6, motionEasing: 'smoothStep',
        postEffects: [
          { effect: 'colorGrade', intensity: 0.7, params: { preset: 'warm-cinematic' } },
          { effect: 'vignette', intensity: 0.3 },
          { effect: 'letterbox', intensity: 0.8 },
        ],
        textOverlay: { text: 'Every Moment Matters', position: 'bottom', fontSize: 'md', fontWeight: 'bold', animation: 'fade-in', color: '#fff' },
      },
      {
        slotType: 'video', duration: 5, transition: 'morphDissolve', effect: 'ken-burns', holdPoint: 'face',
        motionIntensity: 0.6, transitionDuration: 0.6,
        postEffects: [
          { effect: 'colorGrade', intensity: 0.7, params: { preset: 'warm-cinematic' } },
          { effect: 'vignette', intensity: 0.4 },
          { effect: 'letterbox', intensity: 0.8 },
          { effect: 'bloom', intensity: 0.2 },
        ],
      },
      {
        slotType: 'photo', duration: 3, transition: 'fade', effect: 'rack-focus', holdPoint: 'center',
        motionIntensity: 0.5, motionEasing: 'easeInOut',
        postEffects: [
          { effect: 'colorGrade', intensity: 0.7, params: { preset: 'warm-cinematic' } },
          { effect: 'vignette', intensity: 0.3 },
          { effect: 'letterbox', intensity: 0.8 },
        ],
        textOverlay: { text: 'A Journey Begins', position: 'center', fontSize: 'lg', fontWeight: 'bold', animation: 'slide-up', color: '#fff' },
      },
      {
        slotType: 'photo', duration: 4, transition: 'fade', effect: 'dolly-out', holdPoint: 'rule-of-thirds',
        motionIntensity: 0.5, motionEasing: 'easeOut',
        postEffects: [
          { effect: 'colorGrade', intensity: 0.7, params: { preset: 'warm-cinematic' } },
          { effect: 'vignette', intensity: 0.3 },
          { effect: 'letterbox', intensity: 0.8 },
        ],
      },
      {
        slotType: 'video', duration: 5, transition: 'morphDissolve', effect: 'crane-down', holdPoint: 'face',
        motionIntensity: 0.5, transitionDuration: 0.6,
        postEffects: [
          { effect: 'colorGrade', intensity: 0.7, params: { preset: 'warm-cinematic' } },
          { effect: 'vignette', intensity: 0.4 },
          { effect: 'letterbox', intensity: 0.8 },
          { effect: 'lightLeak', intensity: 0.2 },
        ],
        textOverlay: { text: 'The Beauty Within', position: 'top', fontSize: 'md', fontWeight: 'bold', animation: 'fade-in', color: '#fff' },
      },
      {
        // Closing shot: a 360 moment here becomes a tiny planet (Phase 5); photos and flat video render normally.
        slotType: 'any', duration: 4, transition: 'fade', effect: 'slow-zoom', holdPoint: 'center', reframe: 'tiny-planet',
        motionIntensity: 0.4, transitionDuration: 1.0,
        postEffects: [
          { effect: 'colorGrade', intensity: 0.7, params: { preset: 'warm-cinematic' } },
          { effect: 'vignette', intensity: 0.5 },
          { effect: 'letterbox', intensity: 0.8 },
        ],
        textOverlay: { text: 'The End', position: 'center', fontSize: 'xl', fontWeight: 'bold', animation: 'fade-in', color: '#fff' },
      },
    ],
  },

  // ─────────────────────────────────────────────────────────────────────────
  // 2. Rapid Fire — fast cuts, high energy
  // ─────────────────────────────────────────────────────────────────────────
  {
    id: 'rapid-fire',
    name: 'Rapid Fire',
    description: 'Fast cuts, high energy. Quick 1-2s bursts with punchy transitions. Great for events & parties.',
    style: 'dynamic',
    color: '#FF6B00',
    totalDuration: 20,
    mediaCount: 12,
    emoji: '⚡',
    colorGrade: 'high-contrast',
    defaultSpeed: 'ramp-classic',
    theme: {
      bgColor: '#000',
      particles: 'none',
      particleDensity: 0,
      vignette: 0,
    },
    defaultTexts: [
      { text: "LET'S GO", position: 'center', fontSize: 'xl', fontWeight: 'black', animation: 'scale-pop', color: '#FF6B00' },
    ],
    slots: [
      {
        slotType: 'photo', duration: 1.5, transition: 'whipBlur', effect: 'pulse-zoom', holdPoint: 'center',
        motionIntensity: 0.9, transitionDuration: 0.25, speedPreset: 'ramp-classic',
        postEffects: [
          { effect: 'colorGrade', intensity: 0.6, params: { preset: 'high-contrast' } },
        ],
        textOverlay: { text: "LET'S GO", position: 'center', fontSize: 'xl', fontWeight: 'black', animation: 'scale-pop', color: '#FF6B00' },
      },
      {
        slotType: 'photo', duration: 1, transition: 'slideRight', effect: 'whip-pan', holdPoint: 'face',
        motionIntensity: 0.8, transitionDuration: 0.2,
        postEffects: [{ effect: 'colorGrade', intensity: 0.6, params: { preset: 'high-contrast' } }],
      },
      {
        slotType: 'video', duration: 2, transition: 'flashWhite', effect: 'speed-ramp', holdPoint: 'face',
        motionIntensity: 0.8, transitionDuration: 0.15, speedPreset: 'ramp-dramatic',
        postEffects: [{ effect: 'colorGrade', intensity: 0.6, params: { preset: 'high-contrast' } }],
        textOverlay: { text: 'NO LIMITS', position: 'center', fontSize: 'lg', fontWeight: 'black', animation: 'scale-pop', color: '#FF6B00' },
      },
      {
        slotType: 'photo', duration: 1.5, transition: 'whipBlur', effect: 'bounce', holdPoint: 'center',
        motionIntensity: 0.9, transitionDuration: 0.2,
        postEffects: [{ effect: 'colorGrade', intensity: 0.6, params: { preset: 'high-contrast' } }],
      },
      {
        slotType: 'photo', duration: 1, transition: 'slideLeft', effect: 'dolly-in', holdPoint: 'face',
        motionIntensity: 0.8, transitionDuration: 0.2,
        postEffects: [{ effect: 'colorGrade', intensity: 0.6, params: { preset: 'high-contrast' } }],
        textOverlay: { text: 'SEND IT', position: 'bottom', fontSize: 'md', fontWeight: 'black', animation: 'slide-up', color: '#fff' },
      },
      {
        slotType: 'video', duration: 2, transition: 'cubeRotate', effect: 'orbit', holdPoint: 'center',
        motionIntensity: 0.7, transitionDuration: 0.3, speedPreset: 'ramp-classic',
        postEffects: [{ effect: 'colorGrade', intensity: 0.6, params: { preset: 'high-contrast' } }],
      },
      {
        slotType: 'photo', duration: 1.5, transition: 'flashBlack', effect: 'pulse-zoom', holdPoint: 'face',
        motionIntensity: 0.9, transitionDuration: 0.15,
        postEffects: [{ effect: 'colorGrade', intensity: 0.6, params: { preset: 'high-contrast' } }],
        textOverlay: { text: 'ALL GAS', position: 'center', fontSize: 'lg', fontWeight: 'black', animation: 'scale-pop', color: '#FF6B00' },
      },
      {
        slotType: 'photo', duration: 1, transition: 'whipBlur', effect: 'whip-pan', holdPoint: 'center',
        motionIntensity: 0.8, transitionDuration: 0.2,
        postEffects: [{ effect: 'colorGrade', intensity: 0.6, params: { preset: 'high-contrast' } }],
      },
      {
        slotType: 'video', duration: 2, transition: 'flipCard', effect: 'speed-ramp', holdPoint: 'face',
        motionIntensity: 0.8, transitionDuration: 0.25, speedPreset: 'ramp-pulse',
        postEffects: [{ effect: 'colorGrade', intensity: 0.6, params: { preset: 'high-contrast' } }],
        textOverlay: { text: 'NO BRAKES', position: 'center', fontSize: 'md', fontWeight: 'black', animation: 'glitch-in', color: '#fff' },
      },
      {
        slotType: 'photo', duration: 1.5, transition: 'slideLeft', effect: 'bounce', holdPoint: 'center',
        motionIntensity: 0.9, transitionDuration: 0.2,
        postEffects: [{ effect: 'colorGrade', intensity: 0.6, params: { preset: 'high-contrast' } }],
      },
      {
        slotType: 'video', duration: 2, transition: 'flashWhite', effect: 'dolly-out', holdPoint: 'face',
        motionIntensity: 0.7, transitionDuration: 0.2, speedPreset: 'ramp-classic',
        postEffects: [{ effect: 'colorGrade', intensity: 0.6, params: { preset: 'high-contrast' } }],
        textOverlay: { text: 'FULL SEND', position: 'center', fontSize: 'lg', fontWeight: 'black', animation: 'scale-pop', color: '#FF6B00' },
      },
      {
        slotType: 'any', duration: 2.5, transition: 'fade', effect: 'ken-burns', holdPoint: 'center',
        motionIntensity: 0.5, transitionDuration: 0.4,
        postEffects: [
          { effect: 'colorGrade', intensity: 0.6, params: { preset: 'high-contrast' } },
          { effect: 'vignette', intensity: 0.3 },
        ],
        textOverlay: { text: '\u{1F525}\u{1F525}\u{1F525}', position: 'center', fontSize: 'xl', fontWeight: 'black', animation: 'scale-pop', color: '#FF6B00' },
      },
    ],
  },

  // ─────────────────────────────────────────────────────────────────────────
  // 3. Clean & Minimal — simple fades, no gimmicks
  // ─────────────────────────────────────────────────────────────────────────
  {
    id: 'clean-minimal',
    name: 'Clean & Minimal',
    description: 'Simple fades, no gimmicks. Even pacing lets photos breathe. Ideal for portfolios & family albums.',
    style: 'minimal',
    color: '#FFFFFF',
    totalDuration: 28,
    mediaCount: 8,
    emoji: '✨',
    colorGrade: 'pastel-dream',
    theme: {
      bgColor: '#0a0a0f',
      particles: 'none',
      particleDensity: 0,
      vignette: 0,
    },
    defaultTexts: [],
    slots: [
      {
        slotType: 'any', duration: 3.5, transition: 'fade', effect: 'static', holdPoint: 'center',
        transitionDuration: 0.6,
        postEffects: [{ effect: 'colorGrade', intensity: 0.4, params: { preset: 'pastel-dream' } }],
        textOverlay: { text: 'simply beautiful', position: 'center', fontSize: 'lg', fontWeight: 'normal', animation: 'fade-in', color: '#fff' },
      },
      {
        slotType: 'any', duration: 3.5, transition: 'fade', effect: 'slow-zoom', holdPoint: 'center',
        motionIntensity: 0.3, transitionDuration: 0.6,
        postEffects: [{ effect: 'colorGrade', intensity: 0.4, params: { preset: 'pastel-dream' } }],
      },
      {
        slotType: 'any', duration: 3.5, transition: 'fade', effect: 'drift', holdPoint: 'center',
        motionIntensity: 0.25, transitionDuration: 0.6,
        postEffects: [{ effect: 'colorGrade', intensity: 0.4, params: { preset: 'pastel-dream' } }],
      },
      {
        slotType: 'any', duration: 3.5, transition: 'fade', effect: 'static', holdPoint: 'face',
        transitionDuration: 0.6,
        postEffects: [{ effect: 'colorGrade', intensity: 0.4, params: { preset: 'pastel-dream' } }],
        textOverlay: { text: 'less is more', position: 'bottom', fontSize: 'md', fontWeight: 'normal', animation: 'fade-in', color: 'rgba(255,255,255,0.8)' },
      },
      {
        slotType: 'any', duration: 3.5, transition: 'fade', effect: 'slow-zoom', holdPoint: 'center',
        motionIntensity: 0.3, transitionDuration: 0.6,
        postEffects: [{ effect: 'colorGrade', intensity: 0.4, params: { preset: 'pastel-dream' } }],
      },
      {
        slotType: 'any', duration: 3.5, transition: 'fade', effect: 'drift', holdPoint: 'center',
        motionIntensity: 0.25, transitionDuration: 0.6,
        postEffects: [{ effect: 'colorGrade', intensity: 0.4, params: { preset: 'pastel-dream' } }],
      },
      {
        slotType: 'any', duration: 3.5, transition: 'fade', effect: 'static', holdPoint: 'face',
        transitionDuration: 0.6,
        postEffects: [{ effect: 'colorGrade', intensity: 0.4, params: { preset: 'pastel-dream' } }],
      },
      {
        slotType: 'any', duration: 3.5, transition: 'fade', effect: 'slow-zoom', holdPoint: 'center',
        motionIntensity: 0.3, transitionDuration: 0.8,
        postEffects: [{ effect: 'colorGrade', intensity: 0.4, params: { preset: 'pastel-dream' } }],
        textOverlay: { text: '\u2014 fin \u2014', position: 'center', fontSize: 'md', fontWeight: 'normal', animation: 'fade-in', color: 'rgba(255,255,255,0.6)' },
      },
    ],
  },

  // ─────────────────────────────────────────────────────────────────────────
  // 4. Retro VHS Tape — vintage CRT vibes
  // ─────────────────────────────────────────────────────────────────────────
  {
    id: 'retro-tape',
    name: 'Retro VHS Tape',
    description: 'Vintage CRT vibes. Scanlines, color bleed, and glitch transitions. Nostalgic & raw.',
    style: 'retro',
    color: '#FF00FF',
    totalDuration: 24,
    mediaCount: 8,
    emoji: '📼',
    colorGrade: 'retro-vhs',
    theme: {
      bgColor: '#000',
      mediaFilter: 'saturate(0.6) contrast(1.2) sepia(0.3)',
      particles: 'none',
      particleDensity: 0,
      tintOverlay: 'rgba(255,0,255,0.05)',
      vignette: 0.5,
    },
    defaultTexts: [
      { text: 'PLAY ▶', position: 'center', fontSize: 'lg', fontWeight: 'bold', animation: 'glitch-in', color: '#fff' },
    ],
    slots: [
      {
        slotType: 'any', duration: 3, transition: 'glitchBlocks', effect: 'static', holdPoint: 'center',
        transitionDuration: 0.3,
        postEffects: [
          { effect: 'colorGrade', intensity: 0.8, params: { preset: 'vintage-fade' } },
          { effect: 'scanlines', intensity: 0.6 },
          { effect: 'filmGrain', intensity: 0.5 },
          { effect: 'vignette', intensity: 0.5 },
          { effect: 'chromaticAberration', intensity: 0.3 },
        ],
        textOverlay: { text: 'PLAY ▶', position: 'center', fontSize: 'lg', fontWeight: 'bold', animation: 'glitch-in', color: '#fff' },
      },
      {
        slotType: 'any', duration: 2.5, transition: 'rgbSplitWipe', effect: 'drift', holdPoint: 'face',
        motionIntensity: 0.4, transitionDuration: 0.3,
        postEffects: [
          { effect: 'colorGrade', intensity: 0.8, params: { preset: 'vintage-fade' } },
          { effect: 'scanlines', intensity: 0.5 },
          { effect: 'filmGrain', intensity: 0.4 },
          { effect: 'vignette', intensity: 0.4 },
        ],
      },
      {
        slotType: 'any', duration: 4, transition: 'fade', effect: 'slow-zoom', holdPoint: 'center',
        motionIntensity: 0.4,
        postEffects: [
          { effect: 'colorGrade', intensity: 0.8, params: { preset: 'vintage-fade' } },
          { effect: 'scanlines', intensity: 0.5 },
          { effect: 'filmGrain', intensity: 0.4 },
          { effect: 'vignette', intensity: 0.4 },
        ],
        textOverlay: { text: 'REWIND \u25C0\u25C0', position: 'top', fontSize: 'md', fontWeight: 'bold', animation: 'glitch-in', color: '#fff' },
      },
      {
        slotType: 'any', duration: 2.5, transition: 'glitchBlocks', effect: 'static', holdPoint: 'face',
        transitionDuration: 0.25,
        postEffects: [
          { effect: 'colorGrade', intensity: 0.8, params: { preset: 'vintage-fade' } },
          { effect: 'scanlines', intensity: 0.6 },
          { effect: 'filmGrain', intensity: 0.5 },
          { effect: 'chromaticAberration', intensity: 0.4 },
        ],
      },
      {
        slotType: 'any', duration: 3, transition: 'pixelateCrossfade', effect: 'pan-right', holdPoint: 'center',
        motionIntensity: 0.4, transitionDuration: 0.4,
        postEffects: [
          { effect: 'colorGrade', intensity: 0.8, params: { preset: 'vintage-fade' } },
          { effect: 'scanlines', intensity: 0.5 },
          { effect: 'filmGrain', intensity: 0.4 },
          { effect: 'vignette', intensity: 0.4 },
        ],
        textOverlay: { text: 'REC \u25CF', position: 'top', fontSize: 'sm', fontWeight: 'bold', animation: 'none', color: '#ff0000' },
      },
      {
        slotType: 'any', duration: 3, transition: 'fade', effect: 'ken-burns', holdPoint: 'face',
        motionIntensity: 0.5,
        postEffects: [
          { effect: 'colorGrade', intensity: 0.8, params: { preset: 'vintage-fade' } },
          { effect: 'scanlines', intensity: 0.5 },
          { effect: 'filmGrain', intensity: 0.4 },
          { effect: 'lightLeak', intensity: 0.3 },
        ],
      },
      {
        slotType: 'any', duration: 3, transition: 'rgbSplitWipe', effect: 'static', holdPoint: 'center',
        transitionDuration: 0.3,
        postEffects: [
          { effect: 'colorGrade', intensity: 0.8, params: { preset: 'vintage-fade' } },
          { effect: 'scanlines', intensity: 0.6 },
          { effect: 'filmGrain', intensity: 0.5 },
          { effect: 'vignette', intensity: 0.5 },
        ],
        textOverlay: { text: 'TRACKING...', position: 'bottom', fontSize: 'sm', fontWeight: 'normal', animation: 'typewriter', color: 'rgba(255,255,255,0.7)' },
      },
      {
        slotType: 'any', duration: 3, transition: 'fade', effect: 'slow-zoom', holdPoint: 'face',
        motionIntensity: 0.4, transitionDuration: 0.6,
        postEffects: [
          { effect: 'colorGrade', intensity: 0.8, params: { preset: 'vintage-fade' } },
          { effect: 'scanlines', intensity: 0.5 },
          { effect: 'filmGrain', intensity: 0.5 },
          { effect: 'vignette', intensity: 0.5 },
        ],
        textOverlay: { text: 'STOP \u25A0', position: 'center', fontSize: 'lg', fontWeight: 'bold', animation: 'glitch-in', color: '#fff' },
      },
    ],
  },

  // ─────────────────────────────────────────────────────────────────────────
  // 5. Cyber Glitch — digital chaos, neon accents
  // ─────────────────────────────────────────────────────────────────────────
  {
    id: 'cyber-glitch',
    name: 'Cyber Glitch',
    description: 'Digital chaos. RGB splits, data corruption, and neon accents. For the bold.',
    style: 'glitch',
    color: '#00FFFF',
    totalDuration: 18,
    mediaCount: 10,
    emoji: '🔥',
    colorGrade: 'neon-night',
    defaultSpeed: 'ramp-pulse',
    theme: {
      bgColor: '#000',
      mediaFilter: 'hue-rotate(10deg) contrast(1.1)',
      particles: 'sparks',
      particleDensity: 0.3,
      vignette: 0.2,
    },
    defaultTexts: [
      { text: 'SYSTEM ONLINE', position: 'center', fontSize: 'lg', fontWeight: 'black', animation: 'glitch-in', color: '#00FFFF' },
    ],
    slots: [
      {
        slotType: 'any', duration: 1.5, transition: 'glitchBlocks', effect: 'pulse-zoom', holdPoint: 'center',
        motionIntensity: 0.9, transitionDuration: 0.2, speedPreset: 'ramp-pulse',
        postEffects: [
          { effect: 'colorGrade', intensity: 0.7, params: { preset: 'neon-night' } },
          { effect: 'chromaticAberration', intensity: 0.5 },
          { effect: 'scanlines', intensity: 0.3 },
        ],
        textOverlay: { text: 'SYSTEM ONLINE', position: 'center', fontSize: 'lg', fontWeight: 'black', animation: 'glitch-in', color: '#00FFFF' },
      },
      {
        slotType: 'any', duration: 2, transition: 'flashWhite', effect: 'dolly-in', holdPoint: 'face',
        motionIntensity: 0.8, transitionDuration: 0.1,
        postEffects: [
          { effect: 'colorGrade', intensity: 0.7, params: { preset: 'neon-night' } },
          { effect: 'chromaticAberration', intensity: 0.3 },
        ],
      },
      {
        slotType: 'any', duration: 1.5, transition: 'rgbSplitWipe', effect: 'bounce', holdPoint: 'center',
        motionIntensity: 0.9, transitionDuration: 0.25, speedPreset: 'ramp-dramatic',
        postEffects: [
          { effect: 'colorGrade', intensity: 0.7, params: { preset: 'neon-night' } },
          { effect: 'chromaticAberration', intensity: 0.5 },
          { effect: 'scanlines', intensity: 0.2 },
        ],
        textOverlay: { text: 'LOADING...', position: 'bottom', fontSize: 'md', fontWeight: 'bold', animation: 'typewriter', color: '#00FFFF' },
      },
      {
        slotType: 'any', duration: 2.5, transition: 'whipBlur', effect: 'whip-pan', holdPoint: 'face',
        motionIntensity: 0.8, transitionDuration: 0.2,
        postEffects: [
          { effect: 'colorGrade', intensity: 0.7, params: { preset: 'neon-night' } },
          { effect: 'motionBlur', intensity: 0.3 },
        ],
      },
      {
        slotType: 'any', duration: 1.5, transition: 'glitchBlocks', effect: 'pixelate-reveal', holdPoint: 'center',
        motionIntensity: 0.8, transitionDuration: 0.2,
        postEffects: [
          { effect: 'colorGrade', intensity: 0.7, params: { preset: 'neon-night' } },
          { effect: 'chromaticAberration', intensity: 0.6 },
        ],
        textOverlay: { text: 'DATA STREAM', position: 'center', fontSize: 'lg', fontWeight: 'black', animation: 'glitch-in', color: '#00FFFF' },
      },
      {
        slotType: 'any', duration: 2, transition: 'flashBlack', effect: 'orbit', holdPoint: 'face',
        motionIntensity: 0.7, transitionDuration: 0.15, speedPreset: 'ramp-pulse',
        postEffects: [
          { effect: 'colorGrade', intensity: 0.7, params: { preset: 'neon-night' } },
          { effect: 'bloom', intensity: 0.3 },
        ],
      },
      {
        slotType: 'any', duration: 1.5, transition: 'rgbSplitWipe', effect: 'mirror', holdPoint: 'center',
        motionIntensity: 0.8, transitionDuration: 0.2,
        postEffects: [
          { effect: 'colorGrade', intensity: 0.7, params: { preset: 'neon-night' } },
          { effect: 'chromaticAberration', intensity: 0.4 },
          { effect: 'scanlines', intensity: 0.3 },
        ],
        textOverlay: { text: 'OVERRIDE', position: 'center', fontSize: 'lg', fontWeight: 'black', animation: 'scale-pop', color: '#FF0044' },
      },
      {
        slotType: 'any', duration: 1.5, transition: 'glitchBlocks', effect: 'bounce', holdPoint: 'face',
        motionIntensity: 0.9, transitionDuration: 0.2,
        postEffects: [
          { effect: 'colorGrade', intensity: 0.7, params: { preset: 'neon-night' } },
          { effect: 'chromaticAberration', intensity: 0.5 },
        ],
      },
      {
        slotType: 'any', duration: 2, transition: 'pixelateCrossfade', effect: 'speed-ramp', holdPoint: 'center',
        motionIntensity: 0.8, transitionDuration: 0.3, speedPreset: 'ramp-dramatic',
        postEffects: [
          { effect: 'colorGrade', intensity: 0.7, params: { preset: 'neon-night' } },
          { effect: 'chromaticAberration', intensity: 0.4 },
          { effect: 'bloom', intensity: 0.2 },
        ],
        textOverlay: { text: 'UPLOAD COMPLETE', position: 'bottom', fontSize: 'md', fontWeight: 'bold', animation: 'typewriter', color: '#00FFFF' },
      },
      {
        slotType: 'any', duration: 2, transition: 'fade', effect: 'dolly-out', holdPoint: 'face',
        motionIntensity: 0.6, transitionDuration: 0.4,
        postEffects: [
          { effect: 'colorGrade', intensity: 0.7, params: { preset: 'neon-night' } },
          { effect: 'vignette', intensity: 0.5 },
          { effect: 'chromaticAberration', intensity: 0.3 },
        ],
        textOverlay: { text: 'EXIT ///', position: 'center', fontSize: 'md', fontWeight: 'bold', animation: 'glitch-in', color: '#00FFFF' },
      },
    ],
  },

  // ─────────────────────────────────────────────────────────────────────────
  // 6. 3D Parallax — layered depth illusion
  // ─────────────────────────────────────────────────────────────────────────
  {
    id: 'depth-parallax',
    name: '3D Parallax',
    description: 'Layered depth illusion with smooth panning. Faces auto-centered. Premium editorial feel.',
    style: 'parallax',
    color: '#7C3AED',
    totalDuration: 30,
    mediaCount: 7,
    emoji: '🌀',
    colorGrade: 'cool-teal',
    defaultSpeed: 'decelerate',
    theme: {
      bgColor: '#000',
      particles: 'none',
      particleDensity: 0,
      vignette: 0.2,
    },
    defaultTexts: [],
    slots: [
      {
        slotType: 'any', duration: 5, transition: 'morphDissolve', effect: 'parallax', holdPoint: 'face',
        motionIntensity: 0.7, motionEasing: 'smoothStep', transitionDuration: 0.5,
        postEffects: [
          { effect: 'colorGrade', intensity: 0.5, params: { preset: 'cool-teal' } },
          { effect: 'vignette', intensity: 0.3 },
        ],
        speedPreset: 'decelerate',
        textOverlay: { text: 'perspective', position: 'center', fontSize: 'xl', fontWeight: 'bold', animation: 'fade-in', color: '#fff' },
      },
      {
        slotType: 'any', duration: 3.5, transition: 'curtain', effect: 'tilt-shift', holdPoint: 'center',
        motionIntensity: 0.6, motionEasing: 'easeInOut', transitionDuration: 0.4,
        postEffects: [
          { effect: 'colorGrade', intensity: 0.5, params: { preset: 'cool-teal' } },
          { effect: 'vignette', intensity: 0.2 },
        ],
      },
      {
        slotType: 'any', duration: 4.5, transition: 'fade', effect: 'dolly-in', holdPoint: 'face',
        motionIntensity: 0.6, motionEasing: 'easeOut',
        postEffects: [
          { effect: 'colorGrade', intensity: 0.5, params: { preset: 'cool-teal' } },
          { effect: 'vignette', intensity: 0.3 },
          { effect: 'bloom', intensity: 0.15 },
        ],
      },
      {
        slotType: 'any', duration: 4, transition: 'irisWipe', effect: 'parallax', holdPoint: 'rule-of-thirds',
        motionIntensity: 0.7, motionEasing: 'smoothStep', transitionDuration: 0.5,
        postEffects: [
          { effect: 'colorGrade', intensity: 0.5, params: { preset: 'cool-teal' } },
          { effect: 'vignette', intensity: 0.2 },
        ],
        textOverlay: { text: 'every angle', position: 'bottom', fontSize: 'md', fontWeight: 'bold', animation: 'slide-up', color: 'rgba(255,255,255,0.8)' },
      },
      {
        slotType: 'any', duration: 5, transition: 'morphDissolve', effect: 'crane-up', holdPoint: 'face',
        motionIntensity: 0.5, motionEasing: 'easeInOut', transitionDuration: 0.6,
        postEffects: [
          { effect: 'colorGrade', intensity: 0.5, params: { preset: 'cool-teal' } },
          { effect: 'vignette', intensity: 0.3 },
        ],
        speedPreset: 'decelerate',
      },
      {
        slotType: 'any', duration: 3.5, transition: 'radialWipe', effect: 'drift', holdPoint: 'center',
        motionIntensity: 0.5, motionEasing: 'easeOut', transitionDuration: 0.4,
        postEffects: [
          { effect: 'colorGrade', intensity: 0.5, params: { preset: 'cool-teal' } },
          { effect: 'vignette', intensity: 0.2 },
        ],
      },
      {
        slotType: 'any', duration: 4.5, transition: 'fade', effect: 'parallax', holdPoint: 'face',
        motionIntensity: 0.7, motionEasing: 'smoothStep', transitionDuration: 0.8,
        postEffects: [
          { effect: 'colorGrade', intensity: 0.5, params: { preset: 'cool-teal' } },
          { effect: 'vignette', intensity: 0.4 },
        ],
        textOverlay: { text: 'new depth', position: 'center', fontSize: 'lg', fontWeight: 'bold', animation: 'fade-in', color: '#fff' },
      },
    ],
  },

  // ─────────────────────────────────────────────────────────────────────────
  // 7. Summer Vibes — sun-soaked warmth
  // ─────────────────────────────────────────────────────────────────────────
  {
    id: 'summer-vibes',
    name: 'Summer Vibes',
    description: 'Sun-soaked warmth. Golden tones, lens flares, and tropical energy. Perfect for vacation & beach days.',
    style: 'summer',
    color: '#FF8C00',
    totalDuration: 28,
    mediaCount: 8,
    emoji: '☀️',
    colorGrade: 'golden-hour',
    theme: {
      mediaFilter: 'saturate(1.3) brightness(1.05)',
      bgColor: '#1a0f00',
      particles: 'bubbles',
      particleDensity: 0.2,
      tintOverlay: 'rgba(255,140,0,0.08)',
      vignette: 0.2,
    },
    defaultTexts: [
      { text: 'SUMMER VIBES ☀️', position: 'center', fontSize: 'xl', fontWeight: 'black', animation: 'scale-pop', color: '#FFD700', glowColor: 'rgba(255,140,0,0.6)' },
      { text: 'good times only', position: 'bottom', fontSize: 'md', fontWeight: 'normal', animation: 'fade-in', color: '#fff' },
    ],
    slots: [
      {
        // Opening shot: a 360 moment here becomes a tiny planet (Phase 5); other media render normally.
        slotType: 'any', duration: 4, transition: 'morphDissolve', effect: 'dolly-in', holdPoint: 'face', reframe: 'tiny-planet',
        motionIntensity: 0.5, motionEasing: 'easeOut', transitionDuration: 0.5,
        postEffects: [
          { effect: 'colorGrade', intensity: 0.6, params: { preset: 'golden-hour' } },
          { effect: 'lensFlare', intensity: 0.3 },
          { effect: 'bloom', intensity: 0.25 },
          { effect: 'vignette', intensity: 0.2 },
        ],
        textOverlay: { text: 'SUMMER VIBES ☀️', position: 'center', fontSize: 'xl', fontWeight: 'black', animation: 'scale-pop', color: '#FFD700', glowColor: 'rgba(255,140,0,0.6)' },
      },
      {
        slotType: 'any', duration: 3, transition: 'fade', effect: 'ken-burns', holdPoint: 'center',
        motionIntensity: 0.5,
        postEffects: [
          { effect: 'colorGrade', intensity: 0.6, params: { preset: 'golden-hour' } },
          { effect: 'lightLeak', intensity: 0.3 },
          { effect: 'bloom', intensity: 0.2 },
        ],
      },
      {
        slotType: 'any', duration: 3.5, transition: 'curtain', effect: 'drift', holdPoint: 'rule-of-thirds',
        motionIntensity: 0.5, transitionDuration: 0.4,
        postEffects: [
          { effect: 'colorGrade', intensity: 0.6, params: { preset: 'golden-hour' } },
          { effect: 'lensFlare', intensity: 0.2 },
        ],
        textOverlay: { text: 'VITAMIN SEA \u{1F30A}', position: 'center', fontSize: 'lg', fontWeight: 'black', animation: 'scale-pop', color: '#FFD700', glowColor: 'rgba(255,140,0,0.5)' },
      },
      {
        slotType: 'any', duration: 4, transition: 'fade', effect: 'crane-up', holdPoint: 'face',
        motionIntensity: 0.4, motionEasing: 'easeOut',
        postEffects: [
          { effect: 'colorGrade', intensity: 0.6, params: { preset: 'golden-hour' } },
          { effect: 'bloom', intensity: 0.25 },
          { effect: 'lightLeak', intensity: 0.25 },
        ],
      },
      {
        slotType: 'any', duration: 3, transition: 'radialWipe', effect: 'orbit', holdPoint: 'center',
        motionIntensity: 0.4, transitionDuration: 0.4,
        postEffects: [
          { effect: 'colorGrade', intensity: 0.6, params: { preset: 'golden-hour' } },
          { effect: 'lensFlare', intensity: 0.3 },
        ],
        textOverlay: { text: 'GOLDEN DAYS', position: 'top', fontSize: 'md', fontWeight: 'bold', animation: 'slide-up', color: '#fff' },
      },
      {
        slotType: 'any', duration: 3.5, transition: 'fade', effect: 'dolly-out', holdPoint: 'rule-of-thirds',
        motionIntensity: 0.5,
        postEffects: [
          { effect: 'colorGrade', intensity: 0.6, params: { preset: 'golden-hour' } },
          { effect: 'bloom', intensity: 0.2 },
          { effect: 'lightLeak', intensity: 0.2 },
        ],
        textOverlay: { text: 'SOAK IT IN', position: 'center', fontSize: 'lg', fontWeight: 'bold', animation: 'fade-in', color: '#FFD700' },
      },
      {
        slotType: 'any', duration: 3.5, transition: 'morphDissolve', effect: 'ken-burns', holdPoint: 'face',
        motionIntensity: 0.5, transitionDuration: 0.5,
        postEffects: [
          { effect: 'colorGrade', intensity: 0.6, params: { preset: 'golden-hour' } },
          { effect: 'lensFlare', intensity: 0.25 },
          { effect: 'vignette', intensity: 0.2 },
        ],
      },
      {
        slotType: 'any', duration: 3.5, transition: 'fade', effect: 'drift', holdPoint: 'center',
        motionIntensity: 0.4, transitionDuration: 0.6,
        postEffects: [
          { effect: 'colorGrade', intensity: 0.6, params: { preset: 'golden-hour' } },
          { effect: 'bloom', intensity: 0.3 },
          { effect: 'vignette', intensity: 0.3 },
        ],
        textOverlay: { text: 'good times only', position: 'bottom', fontSize: 'md', fontWeight: 'normal', animation: 'fade-in', color: '#fff' },
      },
    ],
  },

  // ─────────────────────────────────────────────────────────────────────────
  // 8. Winter Wonderland — frosty elegance
  // ─────────────────────────────────────────────────────────────────────────
  {
    id: 'winter-wonderland',
    name: 'Winter Wonderland',
    description: 'Frosty elegance. Snowfall, cool blue tones, and crisp transitions. Holiday magic.',
    style: 'winter',
    color: '#87CEEB',
    totalDuration: 30,
    mediaCount: 8,
    emoji: '❄️',
    colorGrade: 'moonlit',
    theme: {
      mediaFilter: 'brightness(1.05) saturate(0.85) hue-rotate(-10deg)',
      bgColor: '#050a14',
      particles: 'snow',
      particleDensity: 0.6,
      tintOverlay: 'rgba(135,206,235,0.06)',
      vignette: 0.3,
    },
    defaultTexts: [
      { text: 'WINTER WONDERLAND ❄️', position: 'center', fontSize: 'xl', fontWeight: 'bold', animation: 'slide-up', color: '#E0F0FF', glowColor: 'rgba(135,206,235,0.5)' },
      { text: 'warmth in every moment', position: 'bottom', fontSize: 'md', fontWeight: 'normal', animation: 'fade-in', color: '#C8DDEF' },
    ],
    slots: [
      {
        slotType: 'any', duration: 4.5, transition: 'morphDissolve', effect: 'crane-down', holdPoint: 'face',
        motionIntensity: 0.4, motionEasing: 'easeOut', transitionDuration: 0.6,
        postEffects: [
          { effect: 'colorGrade', intensity: 0.6, params: { preset: 'cool-teal' } },
          { effect: 'bloom', intensity: 0.3 },
          { effect: 'vignette', intensity: 0.3 },
        ],
        textOverlay: { text: 'WINTER WONDERLAND ❄️', position: 'center', fontSize: 'xl', fontWeight: 'bold', animation: 'slide-up', color: '#E0F0FF', glowColor: 'rgba(135,206,235,0.5)' },
      },
      {
        slotType: 'any', duration: 3.5, transition: 'fade', effect: 'ken-burns', holdPoint: 'center',
        motionIntensity: 0.5,
        postEffects: [
          { effect: 'colorGrade', intensity: 0.6, params: { preset: 'cool-teal' } },
          { effect: 'bloom', intensity: 0.25 },
        ],
      },
      {
        slotType: 'any', duration: 4, transition: 'irisWipe', effect: 'drift', holdPoint: 'rule-of-thirds',
        motionIntensity: 0.4, transitionDuration: 0.5,
        postEffects: [
          { effect: 'colorGrade', intensity: 0.6, params: { preset: 'cool-teal' } },
          { effect: 'bloom', intensity: 0.2 },
          { effect: 'vignette', intensity: 0.2 },
        ],
        textOverlay: { text: 'let it snow \u2744', position: 'center', fontSize: 'lg', fontWeight: 'bold', animation: 'fade-in', color: '#E0F0FF', glowColor: 'rgba(135,206,235,0.4)' },
      },
      {
        slotType: 'any', duration: 3.5, transition: 'fade', effect: 'dolly-in', holdPoint: 'face',
        motionIntensity: 0.4, motionEasing: 'easeInOut',
        postEffects: [
          { effect: 'colorGrade', intensity: 0.6, params: { preset: 'cool-teal' } },
          { effect: 'bloom', intensity: 0.3 },
          { effect: 'lightLeak', intensity: 0.15 },
        ],
      },
      {
        slotType: 'any', duration: 4, transition: 'curtain', effect: 'parallax', holdPoint: 'center',
        motionIntensity: 0.5, transitionDuration: 0.4,
        postEffects: [
          { effect: 'colorGrade', intensity: 0.6, params: { preset: 'cool-teal' } },
          { effect: 'bloom', intensity: 0.25 },
        ],
        textOverlay: { text: 'cozy moments', position: 'bottom', fontSize: 'md', fontWeight: 'bold', animation: 'slide-up', color: '#C8DDEF' },
      },
      {
        slotType: 'any', duration: 3.5, transition: 'fade', effect: 'rack-focus', holdPoint: 'face',
        motionIntensity: 0.4,
        postEffects: [
          { effect: 'colorGrade', intensity: 0.6, params: { preset: 'cool-teal' } },
          { effect: 'bloom', intensity: 0.2 },
          { effect: 'vignette', intensity: 0.3 },
        ],
      },
      {
        slotType: 'any', duration: 3.5, transition: 'morphDissolve', effect: 'dolly-out', holdPoint: 'rule-of-thirds',
        motionIntensity: 0.4, transitionDuration: 0.5,
        postEffects: [
          { effect: 'colorGrade', intensity: 0.6, params: { preset: 'cool-teal' } },
          { effect: 'bloom', intensity: 0.25 },
        ],
        textOverlay: { text: 'magic in the air', position: 'center', fontSize: 'md', fontWeight: 'bold', animation: 'fade-in', color: '#E0F0FF' },
      },
      {
        slotType: 'any', duration: 3.5, transition: 'fade', effect: 'slow-zoom', holdPoint: 'center',
        motionIntensity: 0.3, transitionDuration: 0.8,
        postEffects: [
          { effect: 'colorGrade', intensity: 0.6, params: { preset: 'cool-teal' } },
          { effect: 'bloom', intensity: 0.3 },
          { effect: 'vignette', intensity: 0.4 },
        ],
        textOverlay: { text: 'warmth in every moment', position: 'bottom', fontSize: 'md', fontWeight: 'normal', animation: 'fade-in', color: '#C8DDEF' },
      },
    ],
  },

  // ─────────────────────────────────────────────────────────────────────────
  // 9. Party Night — confetti, neon, celebration
  // ─────────────────────────────────────────────────────────────────────────
  {
    id: 'party-night',
    name: 'Party Night',
    description: 'Confetti, neon, celebration. Fast cuts with explosive energy. Birthday, NYE, any bash.',
    style: 'party',
    color: '#FF1493',
    totalDuration: 22,
    mediaCount: 10,
    emoji: '🎉',
    colorGrade: 'electric-pop',
    defaultSpeed: 'ramp-classic',
    theme: {
      mediaFilter: 'contrast(1.15) saturate(1.2)',
      bgColor: '#0a0008',
      particles: 'confetti',
      particleDensity: 0.7,
      tintOverlay: 'rgba(255,20,147,0.06)',
      vignette: 0.15,
    },
    defaultTexts: [
      { text: "LET'S PARTY 🎉", position: 'center', fontSize: 'xl', fontWeight: 'black', animation: 'scale-pop', color: '#FF1493', glowColor: 'rgba(255,20,147,0.7)' },
      { text: 'WHAT A NIGHT', position: 'center', fontSize: 'lg', fontWeight: 'bold', animation: 'slide-up', color: '#FFD700' },
    ],
    slots: [
      {
        slotType: 'any', duration: 2, transition: 'flashWhite', effect: 'pulse-zoom', holdPoint: 'center',
        motionIntensity: 0.9, transitionDuration: 0.15, speedPreset: 'ramp-pulse',
        postEffects: [
          { effect: 'colorGrade', intensity: 0.5, params: { preset: 'electric-pop' } },
          { effect: 'bloom', intensity: 0.3 },
        ],
        textOverlay: { text: "LET'S PARTY 🎉", position: 'center', fontSize: 'xl', fontWeight: 'black', animation: 'scale-pop', color: '#FF1493', glowColor: 'rgba(255,20,147,0.7)' },
      },
      {
        slotType: 'any', duration: 1.5, transition: 'whipBlur', effect: 'whip-pan', holdPoint: 'face',
        motionIntensity: 0.8, transitionDuration: 0.2,
        postEffects: [{ effect: 'colorGrade', intensity: 0.5, params: { preset: 'electric-pop' } }],
      },
      {
        slotType: 'any', duration: 2.5, transition: 'cubeRotate', effect: 'orbit', holdPoint: 'center',
        motionIntensity: 0.7, transitionDuration: 0.3, speedPreset: 'ramp-classic',
        postEffects: [
          { effect: 'colorGrade', intensity: 0.5, params: { preset: 'electric-pop' } },
          { effect: 'bloom', intensity: 0.2 },
        ],
        textOverlay: { text: 'TURN UP \u{1F50A}', position: 'center', fontSize: 'lg', fontWeight: 'black', animation: 'scale-pop', color: '#FFD700', glowColor: 'rgba(255,215,0,0.5)' },
      },
      {
        slotType: 'any', duration: 2, transition: 'glitchBlocks', effect: 'bounce', holdPoint: 'face',
        motionIntensity: 0.9, transitionDuration: 0.2,
        postEffects: [
          { effect: 'colorGrade', intensity: 0.5, params: { preset: 'electric-pop' } },
          { effect: 'chromaticAberration', intensity: 0.2 },
        ],
      },
      {
        slotType: 'any', duration: 2, transition: 'flashBlack', effect: 'dolly-in', holdPoint: 'center',
        motionIntensity: 0.7, transitionDuration: 0.15,
        postEffects: [{ effect: 'colorGrade', intensity: 0.5, params: { preset: 'electric-pop' } }],
        textOverlay: { text: 'BEST NIGHT EVER', position: 'center', fontSize: 'lg', fontWeight: 'black', animation: 'slide-up', color: '#FF1493' },
      },
      {
        slotType: 'any', duration: 2.5, transition: 'flipCard', effect: 'speed-ramp', holdPoint: 'face',
        motionIntensity: 0.8, transitionDuration: 0.25, speedPreset: 'ramp-dramatic',
        postEffects: [
          { effect: 'colorGrade', intensity: 0.5, params: { preset: 'electric-pop' } },
          { effect: 'bloom', intensity: 0.25 },
        ],
      },
      {
        slotType: 'any', duration: 2, transition: 'whipBlur', effect: 'pulse-zoom', holdPoint: 'center',
        motionIntensity: 0.9, transitionDuration: 0.2,
        postEffects: [{ effect: 'colorGrade', intensity: 0.5, params: { preset: 'electric-pop' } }],
        textOverlay: { text: "CAN'T STOP WON'T STOP", position: 'bottom', fontSize: 'md', fontWeight: 'bold', animation: 'glitch-in', color: '#fff' },
      },
      {
        slotType: 'any', duration: 2, transition: 'rgbSplitWipe', effect: 'bounce', holdPoint: 'face',
        motionIntensity: 0.8, transitionDuration: 0.2,
        postEffects: [
          { effect: 'colorGrade', intensity: 0.5, params: { preset: 'electric-pop' } },
          { effect: 'chromaticAberration', intensity: 0.3 },
        ],
      },
      {
        slotType: 'any', duration: 2.5, transition: 'flashWhite', effect: 'whip-pan', holdPoint: 'rule-of-thirds',
        motionIntensity: 0.8, transitionDuration: 0.15, speedPreset: 'ramp-pulse',
        postEffects: [{ effect: 'colorGrade', intensity: 0.5, params: { preset: 'electric-pop' } }],
        textOverlay: { text: 'ONE MORE TIME', position: 'center', fontSize: 'lg', fontWeight: 'black', animation: 'scale-pop', color: '#FFD700' },
      },
      {
        slotType: 'any', duration: 3, transition: 'fade', effect: 'slow-zoom', holdPoint: 'center',
        motionIntensity: 0.5, transitionDuration: 0.5,
        postEffects: [
          { effect: 'colorGrade', intensity: 0.5, params: { preset: 'electric-pop' } },
          { effect: 'bloom', intensity: 0.3 },
          { effect: 'vignette', intensity: 0.3 },
        ],
        textOverlay: { text: 'WHAT A NIGHT', position: 'center', fontSize: 'lg', fontWeight: 'bold', animation: 'slide-up', color: '#FFD700' },
      },
    ],
  },

  // ─────────────────────────────────────────────────────────────────────────
  // 10. Electric Storm — high voltage energy
  // ─────────────────────────────────────────────────────────────────────────
  {
    id: 'electric-storm',
    name: 'Electric Storm',
    description: 'High voltage energy. Lightning sparks, electric blue accents, and thunderous cuts.',
    style: 'electric',
    color: '#00BFFF',
    totalDuration: 24,
    mediaCount: 9,
    emoji: '⚡',
    colorGrade: 'bleach-bypass',
    defaultSpeed: 'ramp-dramatic',
    theme: {
      mediaFilter: 'contrast(1.2) brightness(0.95)',
      bgColor: '#000510',
      particles: 'sparks',
      particleDensity: 0.5,
      tintOverlay: 'rgba(0,191,255,0.05)',
      vignette: 0.4,
    },
    defaultTexts: [
      { text: '⚡ ELECTRIC ⚡', position: 'center', fontSize: 'xl', fontWeight: 'black', animation: 'glitch-in', color: '#00BFFF', glowColor: 'rgba(0,191,255,0.7)' },
      { text: 'POWER UP', position: 'center', fontSize: 'lg', fontWeight: 'bold', animation: 'scale-pop', color: '#fff' },
    ],
    slots: [
      {
        slotType: 'any', duration: 2.5, transition: 'flashWhite', effect: 'pulse-zoom', holdPoint: 'center',
        motionIntensity: 0.9, transitionDuration: 0.1, speedPreset: 'ramp-dramatic',
        postEffects: [
          { effect: 'colorGrade', intensity: 0.7, params: { preset: 'bleach-bypass' } },
          { effect: 'bloom', intensity: 0.4 },
          { effect: 'chromaticAberration', intensity: 0.3 },
        ],
        textOverlay: { text: '⚡ ELECTRIC ⚡', position: 'center', fontSize: 'xl', fontWeight: 'black', animation: 'glitch-in', color: '#00BFFF', glowColor: 'rgba(0,191,255,0.7)' },
      },
      {
        slotType: 'any', duration: 2.5, transition: 'whipBlur', effect: 'dolly-in', holdPoint: 'face',
        motionIntensity: 0.8, transitionDuration: 0.2,
        postEffects: [
          { effect: 'colorGrade', intensity: 0.7, params: { preset: 'bleach-bypass' } },
          { effect: 'bloom', intensity: 0.3 },
        ],
      },
      {
        slotType: 'any', duration: 3, transition: 'rgbSplitWipe', effect: 'whip-pan', holdPoint: 'rule-of-thirds',
        motionIntensity: 0.8, transitionDuration: 0.25,
        postEffects: [
          { effect: 'colorGrade', intensity: 0.7, params: { preset: 'bleach-bypass' } },
          { effect: 'motionBlur', intensity: 0.3 },
          { effect: 'bloom', intensity: 0.2 },
        ],
        textOverlay: { text: 'FULL CHARGE', position: 'center', fontSize: 'lg', fontWeight: 'black', animation: 'glitch-in', color: '#00BFFF', glowColor: 'rgba(0,191,255,0.6)' },
      },
      {
        slotType: 'any', duration: 2.5, transition: 'flashBlack', effect: 'bounce', holdPoint: 'center',
        motionIntensity: 0.9, transitionDuration: 0.15, speedPreset: 'ramp-pulse',
        postEffects: [
          { effect: 'colorGrade', intensity: 0.7, params: { preset: 'bleach-bypass' } },
          { effect: 'bloom', intensity: 0.4 },
          { effect: 'chromaticAberration', intensity: 0.2 },
        ],
      },
      {
        slotType: 'any', duration: 3, transition: 'shatter', effect: 'speed-ramp', holdPoint: 'face',
        motionIntensity: 0.8, transitionDuration: 0.3, speedPreset: 'ramp-dramatic',
        postEffects: [
          { effect: 'colorGrade', intensity: 0.7, params: { preset: 'bleach-bypass' } },
          { effect: 'bloom', intensity: 0.3 },
        ],
        textOverlay: { text: 'VOLTAGE', position: 'center', fontSize: 'xl', fontWeight: 'black', animation: 'scale-pop', color: '#fff' },
      },
      {
        slotType: 'any', duration: 2.5, transition: 'glitchBlocks', effect: 'orbit', holdPoint: 'center',
        motionIntensity: 0.7, transitionDuration: 0.2,
        postEffects: [
          { effect: 'colorGrade', intensity: 0.7, params: { preset: 'bleach-bypass' } },
          { effect: 'chromaticAberration', intensity: 0.3 },
          { effect: 'bloom', intensity: 0.25 },
        ],
      },
      {
        slotType: 'any', duration: 2.5, transition: 'whipBlur', effect: 'whip-pan', holdPoint: 'face',
        motionIntensity: 0.8, transitionDuration: 0.2,
        postEffects: [
          { effect: 'colorGrade', intensity: 0.7, params: { preset: 'bleach-bypass' } },
          { effect: 'motionBlur', intensity: 0.3 },
        ],
        textOverlay: { text: 'SURGE', position: 'center', fontSize: 'lg', fontWeight: 'black', animation: 'glitch-in', color: '#00BFFF' },
      },
      {
        slotType: 'any', duration: 3, transition: 'flashWhite', effect: 'pulse-zoom', holdPoint: 'rule-of-thirds',
        motionIntensity: 0.9, transitionDuration: 0.15, speedPreset: 'ramp-pulse',
        postEffects: [
          { effect: 'colorGrade', intensity: 0.7, params: { preset: 'bleach-bypass' } },
          { effect: 'bloom', intensity: 0.4 },
        ],
      },
      {
        slotType: 'any', duration: 2.5, transition: 'fade', effect: 'dolly-out', holdPoint: 'center',
        motionIntensity: 0.6, transitionDuration: 0.4,
        postEffects: [
          { effect: 'colorGrade', intensity: 0.7, params: { preset: 'bleach-bypass' } },
          { effect: 'bloom', intensity: 0.3 },
          { effect: 'vignette', intensity: 0.5 },
        ],
        textOverlay: { text: 'POWER UP', position: 'center', fontSize: 'lg', fontWeight: 'bold', animation: 'scale-pop', color: '#fff' },
      },
    ],
  },

  // ─────────────────────────────────────────────────────────────────────────
  // 11. Golden Hour — sunset warmth & romance
  // ─────────────────────────────────────────────────────────────────────────
  {
    id: 'golden-hour',
    name: 'Golden Hour',
    description: 'Sunset warmth & romance. Soft lens flares, warm color grade. Weddings, date nights, love stories.',
    style: 'golden',
    color: '#FF6347',
    totalDuration: 32,
    mediaCount: 8,
    emoji: '🌅',
    colorGrade: 'golden-hour',
    defaultSpeed: 'slow-mo',
    theme: {
      mediaFilter: 'saturate(1.2) brightness(1.08) sepia(0.15)',
      bgColor: '#0f0800',
      particles: 'hearts',
      particleDensity: 0.15,
      tintOverlay: 'rgba(255,99,71,0.06)',
      vignette: 0.35,
    },
    defaultTexts: [
      { text: 'golden hour', position: 'center', fontSize: 'xl', fontWeight: 'normal', animation: 'fade-in', color: '#FFF5E6' },
      { text: 'forever yours', position: 'bottom', fontSize: 'md', fontWeight: 'normal', animation: 'fade-in', color: '#FFF5E6' },
    ],
    slots: [
      {
        slotType: 'any', duration: 5, transition: 'morphDissolve', effect: 'dolly-in', holdPoint: 'face',
        motionIntensity: 0.4, motionEasing: 'easeOut', transitionDuration: 0.8, speedPreset: 'slow-mo',
        postEffects: [
          { effect: 'colorGrade', intensity: 0.7, params: { preset: 'warm-cinematic' } },
          { effect: 'lensFlare', intensity: 0.35 },
          { effect: 'bloom', intensity: 0.35 },
          { effect: 'vignette', intensity: 0.3 },
        ],
        textOverlay: { text: 'golden hour', position: 'center', fontSize: 'xl', fontWeight: 'normal', animation: 'fade-in', color: '#FFF5E6' },
      },
      {
        slotType: 'any', duration: 4, transition: 'fade', effect: 'crane-up', holdPoint: 'center',
        motionIntensity: 0.3, motionEasing: 'easeInOut',
        postEffects: [
          { effect: 'colorGrade', intensity: 0.7, params: { preset: 'warm-cinematic' } },
          { effect: 'lightLeak', intensity: 0.3 },
          { effect: 'bloom', intensity: 0.3 },
        ],
      },
      {
        slotType: 'any', duration: 3.5, transition: 'radialWipe', effect: 'drift', holdPoint: 'rule-of-thirds',
        motionIntensity: 0.4, transitionDuration: 0.5,
        postEffects: [
          { effect: 'colorGrade', intensity: 0.7, params: { preset: 'warm-cinematic' } },
          { effect: 'lensFlare', intensity: 0.25 },
          { effect: 'bloom', intensity: 0.25 },
        ],
        textOverlay: { text: 'timeless', position: 'center', fontSize: 'lg', fontWeight: 'normal', animation: 'fade-in', color: '#FFF5E6' },
      },
      {
        slotType: 'any', duration: 4.5, transition: 'morphDissolve', effect: 'ken-burns', holdPoint: 'face',
        motionIntensity: 0.5, transitionDuration: 0.7, speedPreset: 'decelerate',
        postEffects: [
          { effect: 'colorGrade', intensity: 0.7, params: { preset: 'warm-cinematic' } },
          { effect: 'bloom', intensity: 0.3 },
          { effect: 'vignette', intensity: 0.3 },
          { effect: 'lightLeak', intensity: 0.2 },
        ],
      },
      {
        slotType: 'any', duration: 4, transition: 'curtain', effect: 'rack-focus', holdPoint: 'center',
        motionIntensity: 0.4, motionEasing: 'easeInOut', transitionDuration: 0.4,
        postEffects: [
          { effect: 'colorGrade', intensity: 0.7, params: { preset: 'warm-cinematic' } },
          { effect: 'lensFlare', intensity: 0.3 },
          { effect: 'bloom', intensity: 0.25 },
        ],
        textOverlay: { text: 'in this light', position: 'bottom', fontSize: 'md', fontWeight: 'normal', animation: 'slide-up', color: 'rgba(255,245,230,0.8)' },
      },
      {
        slotType: 'any', duration: 3.5, transition: 'fade', effect: 'crane-down', holdPoint: 'face',
        motionIntensity: 0.3, motionEasing: 'easeOut',
        postEffects: [
          { effect: 'colorGrade', intensity: 0.7, params: { preset: 'warm-cinematic' } },
          { effect: 'bloom', intensity: 0.3 },
          { effect: 'lightLeak', intensity: 0.25 },
        ],
      },
      {
        slotType: 'any', duration: 3.5, transition: 'morphDissolve', effect: 'dolly-out', holdPoint: 'rule-of-thirds',
        motionIntensity: 0.4, transitionDuration: 0.6,
        postEffects: [
          { effect: 'colorGrade', intensity: 0.7, params: { preset: 'warm-cinematic' } },
          { effect: 'lensFlare', intensity: 0.3 },
          { effect: 'vignette', intensity: 0.3 },
        ],
        textOverlay: { text: 'pure magic', position: 'center', fontSize: 'md', fontWeight: 'normal', animation: 'fade-in', color: '#FFF5E6' },
      },
      {
        slotType: 'any', duration: 4, transition: 'fade', effect: 'slow-zoom', holdPoint: 'center',
        motionIntensity: 0.3, transitionDuration: 1.0, speedPreset: 'slow-mo',
        postEffects: [
          { effect: 'colorGrade', intensity: 0.7, params: { preset: 'warm-cinematic' } },
          { effect: 'bloom', intensity: 0.4 },
          { effect: 'vignette', intensity: 0.4 },
          { effect: 'lensFlare', intensity: 0.2 },
        ],
        textOverlay: { text: 'forever yours', position: 'bottom', fontSize: 'md', fontWeight: 'normal', animation: 'fade-in', color: '#FFF5E6' },
      },
    ],
  },

  // ─────────────────────────────────────────────────────────────────────────
  // 12. Neon Dreams — cyberpunk midnight
  // ─────────────────────────────────────────────────────────────────────────
  {
    id: 'neon-dreams',
    name: 'Neon Dreams',
    description: 'Cyberpunk midnight. Neon glows, purple haze, and pulsing beats. Clubs, raves, after dark.',
    style: 'neon',
    color: '#BF00FF',
    totalDuration: 22,
    mediaCount: 10,
    emoji: '💜',
    colorGrade: 'neon-night',
    defaultSpeed: 'ramp-pulse',
    theme: {
      mediaFilter: 'contrast(1.15) saturate(1.3) hue-rotate(5deg)',
      bgColor: '#05000a',
      particles: 'stars',
      particleDensity: 0.4,
      tintOverlay: 'rgba(191,0,255,0.08)',
      vignette: 0.25,
    },
    defaultTexts: [
      { text: 'NEON DREAMS 💜', position: 'center', fontSize: 'xl', fontWeight: 'black', animation: 'glitch-in', color: '#BF00FF', glowColor: 'rgba(191,0,255,0.8)' },
      { text: 'fade to black', position: 'bottom', fontSize: 'md', fontWeight: 'normal', animation: 'typewriter', color: '#D8B4FE' },
    ],
    slots: [
      {
        slotType: 'any', duration: 2.5, transition: 'swirl', effect: 'pulse-zoom', holdPoint: 'center',
        motionIntensity: 0.8, transitionDuration: 0.3, speedPreset: 'ramp-pulse',
        postEffects: [
          { effect: 'colorGrade', intensity: 0.7, params: { preset: 'neon-night' } },
          { effect: 'bloom', intensity: 0.4 },
          { effect: 'chromaticAberration', intensity: 0.3 },
        ],
        textOverlay: { text: 'NEON DREAMS 💜', position: 'center', fontSize: 'xl', fontWeight: 'black', animation: 'glitch-in', color: '#BF00FF', glowColor: 'rgba(191,0,255,0.8)' },
      },
      {
        slotType: 'any', duration: 2, transition: 'whipBlur', effect: 'whip-pan', holdPoint: 'face',
        motionIntensity: 0.8, transitionDuration: 0.2,
        postEffects: [
          { effect: 'colorGrade', intensity: 0.7, params: { preset: 'neon-night' } },
          { effect: 'bloom', intensity: 0.3 },
        ],
      },
      {
        slotType: 'any', duration: 2, transition: 'flashBlack', effect: 'orbit', holdPoint: 'center',
        motionIntensity: 0.7, transitionDuration: 0.15, speedPreset: 'ramp-dramatic',
        postEffects: [
          { effect: 'colorGrade', intensity: 0.7, params: { preset: 'neon-night' } },
          { effect: 'bloom', intensity: 0.35 },
          { effect: 'chromaticAberration', intensity: 0.2 },
        ],
        textOverlay: { text: 'AFTER DARK', position: 'center', fontSize: 'lg', fontWeight: 'black', animation: 'glitch-in', color: '#BF00FF', glowColor: 'rgba(191,0,255,0.6)' },
      },
      {
        slotType: 'any', duration: 2.5, transition: 'rgbSplitWipe', effect: 'bounce', holdPoint: 'rule-of-thirds',
        motionIntensity: 0.9, transitionDuration: 0.25,
        postEffects: [
          { effect: 'colorGrade', intensity: 0.7, params: { preset: 'neon-night' } },
          { effect: 'chromaticAberration', intensity: 0.4 },
        ],
      },
      {
        slotType: 'any', duration: 2, transition: 'glitchBlocks', effect: 'mirror', holdPoint: 'face',
        motionIntensity: 0.8, transitionDuration: 0.2,
        postEffects: [
          { effect: 'colorGrade', intensity: 0.7, params: { preset: 'neon-night' } },
          { effect: 'bloom', intensity: 0.3 },
          { effect: 'scanlines', intensity: 0.2 },
        ],
        textOverlay: { text: 'CITY LIGHTS', position: 'bottom', fontSize: 'md', fontWeight: 'bold', animation: 'slide-up', color: '#D8B4FE' },
      },
      {
        slotType: 'any', duration: 2, transition: 'flipCard', effect: 'dolly-in', holdPoint: 'center',
        motionIntensity: 0.7, transitionDuration: 0.25, speedPreset: 'ramp-pulse',
        postEffects: [
          { effect: 'colorGrade', intensity: 0.7, params: { preset: 'neon-night' } },
          { effect: 'bloom', intensity: 0.35 },
        ],
      },
      {
        slotType: 'any', duration: 2, transition: 'whipBlur', effect: 'speed-ramp', holdPoint: 'face',
        motionIntensity: 0.8, transitionDuration: 0.2, speedPreset: 'ramp-dramatic',
        postEffects: [
          { effect: 'colorGrade', intensity: 0.7, params: { preset: 'neon-night' } },
          { effect: 'motionBlur', intensity: 0.3 },
        ],
        textOverlay: { text: 'MIDNIGHT RUN', position: 'center', fontSize: 'lg', fontWeight: 'black', animation: 'scale-pop', color: '#BF00FF', glowColor: 'rgba(191,0,255,0.5)' },
      },
      {
        slotType: 'any', duration: 2.5, transition: 'pixelateCrossfade', effect: 'pixelate-reveal', holdPoint: 'center',
        motionIntensity: 0.8, transitionDuration: 0.3,
        postEffects: [
          { effect: 'colorGrade', intensity: 0.7, params: { preset: 'neon-night' } },
          { effect: 'chromaticAberration', intensity: 0.4 },
          { effect: 'bloom', intensity: 0.3 },
        ],
      },
      {
        slotType: 'any', duration: 2, transition: 'flashBlack', effect: 'pulse-zoom', holdPoint: 'rule-of-thirds',
        motionIntensity: 0.9, transitionDuration: 0.15,
        postEffects: [
          { effect: 'colorGrade', intensity: 0.7, params: { preset: 'neon-night' } },
          { effect: 'bloom', intensity: 0.4 },
        ],
        textOverlay: { text: 'NEON GLOW', position: 'center', fontSize: 'md', fontWeight: 'bold', animation: 'glitch-in', color: '#D8B4FE' },
      },
      {
        slotType: 'any', duration: 2.5, transition: 'fade', effect: 'dolly-out', holdPoint: 'center',
        motionIntensity: 0.5, transitionDuration: 0.5,
        postEffects: [
          { effect: 'colorGrade', intensity: 0.7, params: { preset: 'neon-night' } },
          { effect: 'bloom', intensity: 0.3 },
          { effect: 'vignette', intensity: 0.5 },
          { effect: 'chromaticAberration', intensity: 0.2 },
        ],
        textOverlay: { text: 'fade to black', position: 'bottom', fontSize: 'md', fontWeight: 'normal', animation: 'typewriter', color: '#D8B4FE' },
      },
    ],
  },
];

/**
 * Given a template and a set of media, auto-assign media to slots.
 * If more media than slots, extras are distributed evenly.
 * If fewer media, media is repeated to fill all slots.
 *
 * When `kinds` is supplied, slots typed `photo` / `video` take the next unused
 * media of that kind (falling back to any kind when it runs out) and `any`
 * slots take the next unused media in order. Every media item is used once
 * before any repeats, and order within a kind stays chronological. Without
 * `kinds` the assignment is the original round-robin.
 */
export function assignMediaToSlots(
  template: SmartTemplate,
  mediaIds: string[],
  kinds?: ReadonlyMap<string, 'photo' | 'video'>,
): string[] {
  if (mediaIds.length === 0) return template.slots.map(() => '');

  if (!kinds) {
    const assigned: string[] = [];
    for (let i = 0; i < template.slots.length; i++) {
      assigned.push(mediaIds[i % mediaIds.length]);
    }
    return assigned;
  }

  let pool = [...mediaIds];
  const assigned: string[] = new Array(template.slots.length).fill('');
  const takeFrom = (predicate: (id: string) => boolean): string | undefined => {
    const idx = pool.findIndex(predicate);
    if (idx === -1) return undefined;
    return pool.splice(idx, 1)[0];
  };
  // Tiny-planet slots (Phase 5) only make sense with a 360 video, so they choose first; the rest go in order.
  const order = template.slots
    .map((slot, i) => i)
    .sort((a, b) => Number(template.slots[b].reframe === 'tiny-planet') - Number(template.slots[a].reframe === 'tiny-planet') || a - b);
  for (const i of order) {
    const slot = template.slots[i];
    if (pool.length === 0) pool = [...mediaIds]; // wrap: repeat media when slots outnumber it
    // Split-screen slots want photos: their composite is drawn once, so a video tile would freeze.
    const wanted = slot.reframe === 'tiny-planet' ? 'video' : (slot.mediaCount ?? 1) > 1 ? 'photo' : slot.slotType;
    assigned[i] =
      (wanted === 'photo' || wanted === 'video' ? takeFrom((m) => kinds.get(m) === wanted) : undefined) ??
      takeFrom(() => true)!;
  }
  return assigned;
}

/**
 * For split-screen slots, get all media IDs assigned to a given slot.
 * Returns an array of media IDs — single slots return [id], multi-photo return [id1, id2, ...].
 *
 * The approach: a multi-photo slot (e.g., 4-grid) uses the primary assignment plus
 * the next N-1 media from the pool, cycling through available media.
 *
 * When `kinds` is given, split tiles are filled from photos only: the composite
 * is drawn once per slot, so a video in a tile would freeze on its first frame.
 * Fewer than two photos means the split cannot happen — the caller gets a
 * single id back and renders the slot as `single` (videos then actually play).
 */
export function getSlotMediaIds(
  slotIndex: number,
  template: SmartTemplate,
  slotAssignments: string[],
  allMediaIds: string[],
  kinds?: ReadonlyMap<string, 'photo' | 'video'>,
): string[] {
  const slot = template.slots[slotIndex];
  const mediaCount = slot.mediaCount ?? 1;
  const primaryId = slotAssignments[slotIndex] || '';

  if (mediaCount <= 1 || allMediaIds.length === 0) {
    return [primaryId];
  }

  const pool = kinds ? allMediaIds.filter((id) => kinds.get(id) === 'photo') : allMediaIds;
  if (kinds && pool.length < 2) return [primaryId];

  // Pick sequential media starting from the primary assignment (when it is in the pool)
  const primaryIndex = pool.indexOf(primaryId);
  const ids: string[] = [];
  for (let i = 0; i < mediaCount; i++) {
    const idx = primaryIndex >= 0
      ? (primaryIndex + i) % pool.length
      : i % pool.length;
    ids.push(pool[idx]);
  }
  return ids;
}

/**
 * Phase 10: what the exported MP4 will actually last — the sum of slot
 * durations **plus** each inter-slot transition (the export appends them,
 * using the *destination* slot's transitionDuration — see
 * renderTransitionFramesToFFmpeg) **plus** the fade-out after the last slot.
 * Every consumer of `totalDuration` (Timeline card, preview loop, the music
 * mix length, saved projects) shares this one definition so the label, the
 * preview and the MP4 agree. Slots without media skip their transition at
 * export time, so a partially-filled timeline runs slightly shorter than this.
 */
export function renderedDurationSec(slots: ReadonlyArray<Pick<TemplateSlot, 'duration' | 'transitionDuration'>>, fadeOutDuration?: number): number {
  const slotsSum = slots.reduce((sum, s) => sum + s.duration, 0);
  let transitions = 0;
  for (let i = 1; i < slots.length; i++) transitions += slots[i].transitionDuration ?? 0.4;
  return Math.round((slotsSum + transitions + (fadeOutDuration ?? 0)) * 10) / 10;
}

/**
 * Expand a template to accommodate more media than its base slot count.
 *
 * When the user has 60 photos but the template only has 8 slots, this
 * repeats the template's slot pattern (with varied text overlays) to
 * create enough slots for ALL media. The template's visual style,
 * transitions, effects, and theme are preserved.
 *
 * If mediaCount <= template.slots.length, returns the template with only its
 * `totalDuration` corrected to the rendered length (unless `roles` asks for
 * shaping, see below).
 * If targetDuration is provided, adjusts per-slot durations to hit that target.
 *
 * `roles` (Phase 3 story layer) is one entry per slot: `breather` slots hold
 * a little longer, `opener`/`closer` keep the hero speed ramps and become
 * kind-agnostic so the story's chosen shot always lands there.
 */
/**
 * Phase 10.1: fitting a song must never stretch slots into 20-second holds
 * (photos froze, 5 s moments became quarter-speed). Slots are capped at this
 * length; a long song gets *more slots* instead, cycling the media (the
 * assignment already wraps). Beat sync then re-cuts the durations onto beats.
 */
const FIT_MAX_SLOT_SEC = 8;

export function expandTemplateForMedia(
  template: SmartTemplate,
  mediaCount: number,
  targetDuration?: number,
  roles?: ReadonlyArray<ShotRole>,
): SmartTemplate {
  if (mediaCount <= template.slots.length) {
    const sized = { ...template, totalDuration: renderedDurationSec(template.slots, template.fadeOutDuration) };
    return roles ? applyShotRoles(sized, roles) : sized;
  }

  const baseSlots = template.slots;
  const baseCount = baseSlots.length;
  const expandedSlots: TemplateSlot[] = [];
  // Enough slots that none has to exceed the cap; media cycles into the extras
  // (roles beyond the media list default to 'beat' in applyShotRoles).
  const slotCount = targetDuration && targetDuration > 0 ? Math.max(mediaCount, Math.ceil(targetDuration / FIT_MAX_SLOT_SEC)) : mediaCount;

  // Cycle through the base slots to fill all media
  for (let i = 0; i < slotCount; i++) {
    const sourceSlot = baseSlots[i % baseCount];
    const clonedSlot: TemplateSlot = {
      ...sourceSlot,
      // Deep-clone postEffects array
      postEffects: sourceSlot.postEffects?.map(e => ({ ...e, params: e.params ? { ...e.params } : undefined })),
      // Deep-clone textOverlay
      textOverlay: sourceSlot.textOverlay ? { ...sourceSlot.textOverlay } : undefined,
      // Phase 7: remember the base slot so text overrides (keyed by base index) can follow.
      baseIndex: i % baseCount,
    };

    // For slots beyond the base template, vary the text overlays to avoid repetition
    if (i >= baseCount && clonedSlot.textOverlay) {
      // Only show text on ~30% of extended slots to avoid visual fatigue
      const showText = (i % 3 === 0);
      if (!showText) {
        clonedSlot.textOverlay = undefined;
      }
    }

    // Auto-inject split-screen layouts for variety when enough media exists
    // ~every 6th slot gets a multi-photo layout (starting from slot 4)
    if (mediaCount >= 8 && i >= 4 && i % 6 === 4) {
      const layouts: Array<{ layout: import('@/types').SlotLayout; count: number }> = [
        { layout: '2-up-h', count: 2 },
        { layout: '4-grid', count: 4 },
        { layout: '3-up', count: 3 },
        { layout: '2-up-v', count: 2 },
        { layout: 'pip', count: 2 },
      ];
      const pick = layouts[Math.floor(i / 6) % layouts.length];
      clonedSlot.layout = pick.layout;
      clonedSlot.mediaCount = pick.count;
      // Split-screen slots look better with slightly longer duration
      clonedSlot.duration = Math.max(clonedSlot.duration, 3);
      // Remove text overlay from split-screen (too busy)
      clonedSlot.textOverlay = undefined;
    }

    // Auto-inject transition overlays on ~every 5th slot for visual richness
    // (only if the slot doesn't already have one)
    if (!clonedSlot.transitionOverlay && i >= 2 && i % 5 === 2) {
      const overlayIds = ['light-leak', 'flash-bang', 'film-burn', 'spark-shower', 'prism-split', 'radial-wipe', 'glitch-wave'];
      const overlayIdx = Math.floor(i / 5) % overlayIds.length;
      clonedSlot.transitionOverlay = {
        id: overlayIds[overlayIdx],
        opacity: 0.7,
      };
    }

    // Aggressively assign speed presets to make templates more dynamic
    // If a slot doesn't already have a speed preset, give it one based on position
    if (!clonedSlot.speedPreset || clonedSlot.speedPreset === 'normal') {
      const speedPresets = ['classic', 'dramatic', 'pulse', 'accelerate', 'decelerate'];
      // Every 3rd slot gets a speed ramp (starting from slot 1)
      if (i >= 1 && i % 3 === 1) {
        clonedSlot.speedPreset = speedPresets[Math.floor(i / 3) % speedPresets.length];
      }
      // Hero slots (first and last) get dramatic ramping
      if (i === 0) {
        clonedSlot.speedPreset = 'dramatic';
      }
      if (i === slotCount - 1) {
        clonedSlot.speedPreset = 'decelerate';
      }
    }

    // Inject depth-aware effects on some slots for face-centric photos
    // These use focalX/focalY from face detection, so they look best on portraits
    // Every 4th slot starting from slot 2 gets a depth effect (if not already split-screen)
    if (!clonedSlot.layout || clonedSlot.layout === 'single') {
      if (i >= 2 && i % 4 === 2) {
        const depthEffects = ['parallax', 'depth-zoom', 'depth-float'];
        clonedSlot.effect = depthEffects[Math.floor(i / 4) % depthEffects.length];
        clonedSlot.holdPoint = 'face'; // Ensure face detection focal point is used
        clonedSlot.motionIntensity = 0.7;
      }
    }

    expandedSlots.push(clonedSlot);
  }

  // Fit slot durations to a target (e.g. song length). The rendered video
  // still appends transitions and the fade, so with music it now runs a touch
  // past the song into silence — before Phase 10 the audio mix was rendered to
  // the *shorter* slot sum and `-shortest` cut the final slots off the MP4.
  if (targetDuration && targetDuration > 0) {
    const perSlotDuration = targetDuration / slotCount;
    const minDuration = 1.5; // Never go below 1.5s per slot
    const effectiveDuration = Math.min(FIT_MAX_SLOT_SEC, Math.max(perSlotDuration, minDuration));

    for (const slot of expandedSlots) {
      slot.duration = Math.round(effectiveDuration * 10) / 10;
    }
  }

  // A tiny-planet reframe on the template's closing slot is about *closing*, so it
  // follows the real last slot when the template has been expanded (Phase 5).
  const closingBase = baseSlots[baseCount - 1];
  if (closingBase.reframe === 'tiny-planet' && expandedSlots.length > baseCount) {
    expandedSlots[baseCount - 1] = { ...expandedSlots[baseCount - 1], reframe: undefined };
    const last = expandedSlots[expandedSlots.length - 1];
    expandedSlots[expandedSlots.length - 1] = { ...last, reframe: 'tiny-planet', holdPoint: 'center', layout: 'single', mediaCount: 1 };
  }

  const fadeOut = template.fadeOutDuration ?? 0.8; // default fade unless the template sets its own
  const expanded: SmartTemplate = {
    ...template,
    slots: expandedSlots,
    mediaCount,
    totalDuration: renderedDurationSec(expandedSlots, fadeOut),
    fadeOutDuration: fadeOut,
  };
  return roles ? applyShotRoles(expanded, roles) : expanded;
}

/**
 * Phase 7 (§3.4): the user edits text on the BASE template's slots (TemplateStep),
 * while the render walks the EXPANDED template. This resolves which override an
 * expanded slot should honour:
 *  - patches and removals of a base overlay follow every clone that still
 *    carries that overlay (so an edited or removed title stays edited/removed
 *    on repeats the expansion kept);
 *  - a user-added overlay (the base slot had none) applies only at the base
 *    occurrence — repeating user text on every clone would multiply it;
 *  - clones whose text the expansion deliberately dropped stay silent.
 * Unexpanded templates have no baseIndex, so the mapping is the identity.
 */
export function overrideForSlot(
  overrides: Record<number, TextOverlayOverride>,
  slot: TemplateSlot,
  slotIndex: number,
): TextOverlayOverride | undefined {
  const base = slot.baseIndex ?? slotIndex;
  const override = overrides[base];
  if (override === undefined) return undefined;
  if (!slot.textOverlay && slotIndex !== base && override !== null) return undefined;
  return override;
}

/** Longest a breather may hold; keeps calm shots from stalling a fast template. */
const BREATHER_MAX_SEC = 6;

/**
 * Shape slots by story role. Pure: returns a new template; slot indices are
 * unchanged so text overrides keep pointing at the same slots.
 */
export function applyShotRoles(
  template: SmartTemplate,
  roles: ReadonlyArray<ShotRole>,
): SmartTemplate {
  const slots = template.slots.map((slot, i) => {
    const role = roles[i];
    if (!role || role === 'beat') return slot;
    const next: TemplateSlot = { ...slot, slotType: 'any' };
    if (role === 'breather') {
      next.duration = Math.min(BREATHER_MAX_SEC, Math.round(slot.duration * 1.5 * 10) / 10);
      next.speedPreset = 'normal';
      next.motionIntensity = Math.min(slot.motionIntensity ?? 0.5, 0.35);
    } else if (role === 'opener') {
      next.speedPreset = 'dramatic';
    } else if (role === 'planet') {
      // Tiny planet: hold a little longer, centre it, keep motion gentle so the horizon ring reads.
      next.reframe = 'tiny-planet';
      next.holdPoint = 'center';
      next.duration = Math.min(BREATHER_MAX_SEC, Math.round(slot.duration * 1.25 * 10) / 10);
      next.motionIntensity = Math.min(slot.motionIntensity ?? 0.5, 0.35);
      next.layout = 'single';
      next.mediaCount = 1;
      next.textOverlay = undefined;
    } else {
      next.speedPreset = 'decelerate';
    }
    return next;
  });
  return {
    ...template,
    slots,
    totalDuration: renderedDurationSec(slots, template.fadeOutDuration),
  };
}

/**
 * Apply beat sync to a template — adjust slot durations to align transitions
 * with detected beat positions in the audio.
 *
 * This is called AFTER expandTemplateForMedia, when beat detection has completed.
 * It preserves all slot properties except duration.
 */
export function applyBeatSync(
  template: SmartTemplate,
  beatDurations: number[],
): SmartTemplate {
  if (beatDurations.length !== template.slots.length) {
    console.warn('[BeatSync] Duration count mismatch, skipping');
    return template;
  }

  const syncedSlots = template.slots.map((slot, i) => ({
    ...slot,
    duration: beatDurations[i],
    // Deep-clone mutable fields
    postEffects: slot.postEffects?.map(e => ({ ...e, params: e.params ? { ...e.params } : undefined })),
    textOverlay: slot.textOverlay ? { ...slot.textOverlay } : undefined,
    transitionOverlay: slot.transitionOverlay ? { ...slot.transitionOverlay } : undefined,
  }));

  return {
    ...template,
    slots: syncedSlots,
    totalDuration: renderedDurationSec(syncedSlots, template.fadeOutDuration),
  };
}

/**
 * Format total duration as "Xs" or "Xm Ys"
 */
export function formatDuration(seconds: number): string {
  if (seconds < 60) return `${Math.round(seconds)}s`;
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return s > 0 ? `${m}m ${s}s` : `${m}m`;
}

// Legacy templates kept for backwards compat
export const TEMPLATES: Template[] = SMART_TEMPLATES.map(st => ({
  id: st.id,
  name: st.name,
  description: st.description,
  thumbnail: '',
  style: st.style,
  transitionType: st.slots[0]?.transition || 'fade',
  durationPerPhoto: st.totalDuration / st.mediaCount,
  color: st.color,
}));
