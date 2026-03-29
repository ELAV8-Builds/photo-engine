import { SmartTemplate, Template } from '@/types';

/**
 * Smart Templates — pre-built timelines with fixed slot structures.
 * Each slot has its own duration, transition, and effect.
 * Media gets auto-assigned to slots based on type and count.
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
    slots: [
      { slotType: 'any', duration: 5, transition: 'fade', effect: 'ken-burns', holdPoint: 'face', textOverlay: { text: 'Your Story', position: 'center', fontSize: 'xl', fontWeight: 'bold', animation: 'fade-in', color: '#fff' } },
      { slotType: 'any', duration: 3, transition: 'fade', effect: 'slow-zoom', holdPoint: 'center' },
      { slotType: 'any', duration: 4, transition: 'fade', effect: 'pan-left', holdPoint: 'rule-of-thirds' },
      { slotType: 'any', duration: 5, transition: 'fade', effect: 'ken-burns', holdPoint: 'face' },
      { slotType: 'any', duration: 3, transition: 'fade', effect: 'static', holdPoint: 'center' },
      { slotType: 'any', duration: 4, transition: 'fade', effect: 'pan-right', holdPoint: 'rule-of-thirds' },
      { slotType: 'any', duration: 5, transition: 'fade', effect: 'slow-zoom', holdPoint: 'face' },
      { slotType: 'any', duration: 3, transition: 'fade', effect: 'ken-burns', holdPoint: 'center', textOverlay: { text: 'The End', position: 'center', fontSize: 'xl', fontWeight: 'bold', animation: 'fade-in', color: '#fff' } },
    ],
  },

  // ─────────────────────────────────────────────────────────────────────────
  // 2. Rapid Fire — fast cuts, high energy
  // ─────────────────────────────────────────────────────────────────────────
  {
    id: 'rapid-fire',
    name: 'Rapid Fire',
    description: 'Fast cuts, high energy. Quick 1-2s bursts with punchy slide transitions. Great for events & parties.',
    style: 'dynamic',
    color: '#FF6B00',
    totalDuration: 20,
    mediaCount: 12,
    emoji: '⚡',
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
      { slotType: 'any', duration: 1.5, transition: 'slide-left', effect: 'bounce', holdPoint: 'center', textOverlay: { text: "LET'S GO", position: 'center', fontSize: 'xl', fontWeight: 'black', animation: 'scale-pop', color: '#FF6B00' } },
      { slotType: 'any', duration: 1, transition: 'slide-right', effect: 'static', holdPoint: 'face' },
      { slotType: 'any', duration: 2, transition: 'zoom-in', effect: 'slow-zoom', holdPoint: 'face' },
      { slotType: 'any', duration: 1.5, transition: 'slide-left', effect: 'bounce', holdPoint: 'center' },
      { slotType: 'any', duration: 1, transition: 'slide-right', effect: 'static', holdPoint: 'face' },
      { slotType: 'any', duration: 2, transition: 'zoom-out', effect: 'ken-burns', holdPoint: 'center' },
      { slotType: 'any', duration: 1.5, transition: 'slide-left', effect: 'bounce', holdPoint: 'face' },
      { slotType: 'any', duration: 1, transition: 'slide-right', effect: 'static', holdPoint: 'center' },
      { slotType: 'any', duration: 2, transition: 'zoom-in', effect: 'slow-zoom', holdPoint: 'face' },
      { slotType: 'any', duration: 1.5, transition: 'slide-left', effect: 'bounce', holdPoint: 'center' },
      { slotType: 'any', duration: 2, transition: 'zoom-out', effect: 'pan-left', holdPoint: 'face' },
      { slotType: 'any', duration: 2.5, transition: 'fade', effect: 'ken-burns', holdPoint: 'center' },
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
    theme: {
      bgColor: '#0a0a0f',
      particles: 'none',
      particleDensity: 0,
      vignette: 0,
    },
    defaultTexts: [],
    slots: [
      { slotType: 'any', duration: 3.5, transition: 'fade', effect: 'static', holdPoint: 'center' },
      { slotType: 'any', duration: 3.5, transition: 'fade', effect: 'static', holdPoint: 'center' },
      { slotType: 'any', duration: 3.5, transition: 'fade', effect: 'pan-left', holdPoint: 'center' },
      { slotType: 'any', duration: 3.5, transition: 'fade', effect: 'static', holdPoint: 'face' },
      { slotType: 'any', duration: 3.5, transition: 'fade', effect: 'static', holdPoint: 'center' },
      { slotType: 'any', duration: 3.5, transition: 'fade', effect: 'pan-right', holdPoint: 'center' },
      { slotType: 'any', duration: 3.5, transition: 'fade', effect: 'static', holdPoint: 'face' },
      { slotType: 'any', duration: 3.5, transition: 'fade', effect: 'static', holdPoint: 'center' },
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
      { slotType: 'any', duration: 3, transition: 'glitch', effect: 'static', holdPoint: 'center', textOverlay: { text: 'PLAY ▶', position: 'center', fontSize: 'lg', fontWeight: 'bold', animation: 'glitch-in', color: '#fff' } },
      { slotType: 'any', duration: 2.5, transition: 'glitch', effect: 'pan-left', holdPoint: 'face' },
      { slotType: 'any', duration: 4, transition: 'fade', effect: 'slow-zoom', holdPoint: 'center' },
      { slotType: 'any', duration: 2.5, transition: 'glitch', effect: 'static', holdPoint: 'face' },
      { slotType: 'any', duration: 3, transition: 'glitch', effect: 'pan-right', holdPoint: 'center' },
      { slotType: 'any', duration: 3, transition: 'fade', effect: 'ken-burns', holdPoint: 'face' },
      { slotType: 'any', duration: 3, transition: 'glitch', effect: 'static', holdPoint: 'center' },
      { slotType: 'any', duration: 3, transition: 'fade', effect: 'slow-zoom', holdPoint: 'face' },
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
      { slotType: 'any', duration: 1.5, transition: 'glitch', effect: 'bounce', holdPoint: 'center', textOverlay: { text: 'SYSTEM ONLINE', position: 'center', fontSize: 'lg', fontWeight: 'black', animation: 'glitch-in', color: '#00FFFF' } },
      { slotType: 'any', duration: 2, transition: 'zoom-in', effect: 'static', holdPoint: 'face' },
      { slotType: 'any', duration: 1.5, transition: 'glitch', effect: 'bounce', holdPoint: 'center' },
      { slotType: 'any', duration: 2.5, transition: 'slide-left', effect: 'pan-left', holdPoint: 'face' },
      { slotType: 'any', duration: 1.5, transition: 'glitch', effect: 'static', holdPoint: 'center' },
      { slotType: 'any', duration: 2, transition: 'zoom-out', effect: 'bounce', holdPoint: 'face' },
      { slotType: 'any', duration: 1.5, transition: 'glitch', effect: 'static', holdPoint: 'center' },
      { slotType: 'any', duration: 1.5, transition: 'slide-right', effect: 'bounce', holdPoint: 'face' },
      { slotType: 'any', duration: 2, transition: 'glitch', effect: 'slow-zoom', holdPoint: 'center' },
      { slotType: 'any', duration: 2, transition: 'fade', effect: 'ken-burns', holdPoint: 'face' },
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
    theme: {
      bgColor: '#000',
      particles: 'none',
      particleDensity: 0,
      vignette: 0.2,
    },
    defaultTexts: [],
    slots: [
      { slotType: 'any', duration: 5, transition: 'fade', effect: 'parallax', holdPoint: 'face' },
      { slotType: 'any', duration: 3.5, transition: 'slide-left', effect: 'parallax', holdPoint: 'center' },
      { slotType: 'any', duration: 4.5, transition: 'fade', effect: 'ken-burns', holdPoint: 'face' },
      { slotType: 'any', duration: 4, transition: 'slide-right', effect: 'parallax', holdPoint: 'rule-of-thirds' },
      { slotType: 'any', duration: 5, transition: 'fade', effect: 'parallax', holdPoint: 'face' },
      { slotType: 'any', duration: 3.5, transition: 'zoom-in', effect: 'slow-zoom', holdPoint: 'center' },
      { slotType: 'any', duration: 4.5, transition: 'fade', effect: 'parallax', holdPoint: 'face' },
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
      { slotType: 'any', duration: 4, transition: 'fade', effect: 'slow-zoom', holdPoint: 'face', textOverlay: { text: 'SUMMER VIBES ☀️', position: 'center', fontSize: 'xl', fontWeight: 'black', animation: 'scale-pop', color: '#FFD700', glowColor: 'rgba(255,140,0,0.6)' } },
      { slotType: 'any', duration: 3, transition: 'fade', effect: 'ken-burns', holdPoint: 'center' },
      { slotType: 'any', duration: 3.5, transition: 'slide-left', effect: 'pan-left', holdPoint: 'rule-of-thirds' },
      { slotType: 'any', duration: 4, transition: 'fade', effect: 'slow-zoom', holdPoint: 'face' },
      { slotType: 'any', duration: 3, transition: 'fade', effect: 'pan-right', holdPoint: 'center' },
      { slotType: 'any', duration: 3.5, transition: 'slide-right', effect: 'ken-burns', holdPoint: 'rule-of-thirds' },
      { slotType: 'any', duration: 3.5, transition: 'fade', effect: 'slow-zoom', holdPoint: 'face' },
      { slotType: 'any', duration: 3.5, transition: 'fade', effect: 'pan-left', holdPoint: 'center', textOverlay: { text: 'good times only', position: 'bottom', fontSize: 'md', fontWeight: 'normal', animation: 'fade-in', color: '#fff' } },
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
      { slotType: 'any', duration: 4.5, transition: 'fade', effect: 'slow-zoom', holdPoint: 'face', textOverlay: { text: 'WINTER WONDERLAND ❄️', position: 'center', fontSize: 'xl', fontWeight: 'bold', animation: 'slide-up', color: '#E0F0FF', glowColor: 'rgba(135,206,235,0.5)' } },
      { slotType: 'any', duration: 3.5, transition: 'fade', effect: 'ken-burns', holdPoint: 'center' },
      { slotType: 'any', duration: 4, transition: 'fade', effect: 'pan-left', holdPoint: 'rule-of-thirds' },
      { slotType: 'any', duration: 3.5, transition: 'fade', effect: 'slow-zoom', holdPoint: 'face' },
      { slotType: 'any', duration: 4, transition: 'slide-left', effect: 'ken-burns', holdPoint: 'center' },
      { slotType: 'any', duration: 3.5, transition: 'fade', effect: 'static', holdPoint: 'face' },
      { slotType: 'any', duration: 3.5, transition: 'fade', effect: 'pan-right', holdPoint: 'rule-of-thirds' },
      { slotType: 'any', duration: 3.5, transition: 'fade', effect: 'slow-zoom', holdPoint: 'center', textOverlay: { text: 'warmth in every moment', position: 'bottom', fontSize: 'md', fontWeight: 'normal', animation: 'fade-in', color: '#C8DDEF' } },
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
      { slotType: 'any', duration: 2, transition: 'zoom-in', effect: 'bounce', holdPoint: 'center', textOverlay: { text: "LET'S PARTY 🎉", position: 'center', fontSize: 'xl', fontWeight: 'black', animation: 'scale-pop', color: '#FF1493', glowColor: 'rgba(255,20,147,0.7)' } },
      { slotType: 'any', duration: 1.5, transition: 'slide-left', effect: 'static', holdPoint: 'face' },
      { slotType: 'any', duration: 2.5, transition: 'slide-right', effect: 'ken-burns', holdPoint: 'center' },
      { slotType: 'any', duration: 2, transition: 'glitch', effect: 'bounce', holdPoint: 'face' },
      { slotType: 'any', duration: 2, transition: 'zoom-out', effect: 'pan-left', holdPoint: 'center' },
      { slotType: 'any', duration: 2.5, transition: 'slide-left', effect: 'slow-zoom', holdPoint: 'face' },
      { slotType: 'any', duration: 2, transition: 'zoom-in', effect: 'bounce', holdPoint: 'center' },
      { slotType: 'any', duration: 2, transition: 'glitch', effect: 'static', holdPoint: 'face' },
      { slotType: 'any', duration: 2.5, transition: 'slide-right', effect: 'pan-right', holdPoint: 'rule-of-thirds' },
      { slotType: 'any', duration: 3, transition: 'fade', effect: 'slow-zoom', holdPoint: 'center', textOverlay: { text: 'WHAT A NIGHT', position: 'center', fontSize: 'lg', fontWeight: 'bold', animation: 'slide-up', color: '#FFD700' } },
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
      { slotType: 'any', duration: 2.5, transition: 'glitch', effect: 'bounce', holdPoint: 'center', textOverlay: { text: '⚡ ELECTRIC ⚡', position: 'center', fontSize: 'xl', fontWeight: 'black', animation: 'glitch-in', color: '#00BFFF', glowColor: 'rgba(0,191,255,0.7)' } },
      { slotType: 'any', duration: 2.5, transition: 'zoom-in', effect: 'ken-burns', holdPoint: 'face' },
      { slotType: 'any', duration: 3, transition: 'slide-left', effect: 'pan-left', holdPoint: 'rule-of-thirds' },
      { slotType: 'any', duration: 2.5, transition: 'glitch', effect: 'bounce', holdPoint: 'center' },
      { slotType: 'any', duration: 3, transition: 'zoom-out', effect: 'slow-zoom', holdPoint: 'face' },
      { slotType: 'any', duration: 2.5, transition: 'slide-right', effect: 'ken-burns', holdPoint: 'center' },
      { slotType: 'any', duration: 2.5, transition: 'glitch', effect: 'pan-right', holdPoint: 'face' },
      { slotType: 'any', duration: 3, transition: 'zoom-in', effect: 'bounce', holdPoint: 'rule-of-thirds' },
      { slotType: 'any', duration: 2.5, transition: 'fade', effect: 'ken-burns', holdPoint: 'center', textOverlay: { text: 'POWER UP', position: 'center', fontSize: 'lg', fontWeight: 'bold', animation: 'scale-pop', color: '#fff' } },
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
      { slotType: 'any', duration: 5, transition: 'fade', effect: 'ken-burns', holdPoint: 'face', textOverlay: { text: 'golden hour', position: 'center', fontSize: 'xl', fontWeight: 'normal', animation: 'fade-in', color: '#FFF5E6' } },
      { slotType: 'any', duration: 4, transition: 'fade', effect: 'slow-zoom', holdPoint: 'center' },
      { slotType: 'any', duration: 3.5, transition: 'fade', effect: 'pan-left', holdPoint: 'rule-of-thirds' },
      { slotType: 'any', duration: 4.5, transition: 'fade', effect: 'ken-burns', holdPoint: 'face' },
      { slotType: 'any', duration: 4, transition: 'slide-left', effect: 'slow-zoom', holdPoint: 'center' },
      { slotType: 'any', duration: 3.5, transition: 'fade', effect: 'pan-right', holdPoint: 'face' },
      { slotType: 'any', duration: 3.5, transition: 'fade', effect: 'ken-burns', holdPoint: 'rule-of-thirds' },
      { slotType: 'any', duration: 4, transition: 'fade', effect: 'slow-zoom', holdPoint: 'center', textOverlay: { text: 'forever yours', position: 'bottom', fontSize: 'md', fontWeight: 'normal', animation: 'fade-in', color: '#FFF5E6' } },
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
      { slotType: 'any', duration: 2.5, transition: 'glitch', effect: 'bounce', holdPoint: 'center', textOverlay: { text: 'NEON DREAMS 💜', position: 'center', fontSize: 'xl', fontWeight: 'black', animation: 'glitch-in', color: '#BF00FF', glowColor: 'rgba(191,0,255,0.8)' } },
      { slotType: 'any', duration: 2, transition: 'slide-left', effect: 'pan-left', holdPoint: 'face' },
      { slotType: 'any', duration: 2, transition: 'zoom-in', effect: 'slow-zoom', holdPoint: 'center' },
      { slotType: 'any', duration: 2.5, transition: 'slide-right', effect: 'bounce', holdPoint: 'rule-of-thirds' },
      { slotType: 'any', duration: 2, transition: 'glitch', effect: 'pan-right', holdPoint: 'face' },
      { slotType: 'any', duration: 2, transition: 'zoom-out', effect: 'ken-burns', holdPoint: 'center' },
      { slotType: 'any', duration: 2, transition: 'slide-left', effect: 'bounce', holdPoint: 'face' },
      { slotType: 'any', duration: 2.5, transition: 'glitch', effect: 'slow-zoom', holdPoint: 'center' },
      { slotType: 'any', duration: 2, transition: 'zoom-in', effect: 'pan-left', holdPoint: 'rule-of-thirds' },
      { slotType: 'any', duration: 2.5, transition: 'fade', effect: 'static', holdPoint: 'center', textOverlay: { text: 'fade to black', position: 'bottom', fontSize: 'md', fontWeight: 'normal', animation: 'typewriter', color: '#D8B4FE' } },
    ],
  },
];

/**
 * Given a template and a set of media, auto-assign media to slots.
 * If more media than slots, extras are distributed evenly.
 * If fewer media, media is repeated to fill all slots.
 */
export function assignMediaToSlots(
  template: SmartTemplate,
  mediaIds: string[]
): string[] {
  if (mediaIds.length === 0) return template.slots.map(() => '');

  const assigned: string[] = [];
  for (let i = 0; i < template.slots.length; i++) {
    assigned.push(mediaIds[i % mediaIds.length]);
  }
  return assigned;
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
