import { SmartTemplate, Template } from '@/types';

/**
 * Smart Templates — pre-built timelines with fixed slot structures.
 * Each slot has its own duration, transition, and effect.
 * Media gets auto-assigned to slots based on type and count.
 */
export const SMART_TEMPLATES: SmartTemplate[] = [
  {
    id: 'cinematic-journey',
    name: 'Cinematic Journey',
    description: 'Slow, elegant. Long hero shots with gentle Ken Burns zoom. Perfect for travel or portraits.',
    style: 'cinematic',
    color: '#FFD700',
    totalDuration: 32,
    mediaCount: 8,
    slots: [
      { slotType: 'any', duration: 5, transition: 'fade', effect: 'ken-burns', holdPoint: 'face' },
      { slotType: 'any', duration: 3, transition: 'fade', effect: 'slow-zoom', holdPoint: 'center' },
      { slotType: 'any', duration: 4, transition: 'fade', effect: 'pan-left', holdPoint: 'rule-of-thirds' },
      { slotType: 'any', duration: 5, transition: 'fade', effect: 'ken-burns', holdPoint: 'face' },
      { slotType: 'any', duration: 3, transition: 'fade', effect: 'static', holdPoint: 'center' },
      { slotType: 'any', duration: 4, transition: 'fade', effect: 'pan-right', holdPoint: 'rule-of-thirds' },
      { slotType: 'any', duration: 5, transition: 'fade', effect: 'slow-zoom', holdPoint: 'face' },
      { slotType: 'any', duration: 3, transition: 'fade', effect: 'ken-burns', holdPoint: 'center' },
    ],
  },
  {
    id: 'rapid-fire',
    name: 'Rapid Fire',
    description: 'Fast cuts, high energy. Quick 1-2s bursts with punchy slide transitions. Great for events & parties.',
    style: 'dynamic',
    color: '#FF6B00',
    totalDuration: 20,
    mediaCount: 12,
    slots: [
      { slotType: 'any', duration: 1.5, transition: 'slide-left', effect: 'bounce', holdPoint: 'center' },
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
  {
    id: 'clean-minimal',
    name: 'Clean & Minimal',
    description: 'Simple fades, no gimmicks. Even pacing lets photos breathe. Ideal for portfolios & family albums.',
    style: 'minimal',
    color: '#FFFFFF',
    totalDuration: 28,
    mediaCount: 8,
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
  {
    id: 'retro-tape',
    name: 'Retro VHS Tape',
    description: 'Vintage CRT vibes. Scanlines, color bleed, and glitch transitions. Nostalgic & raw.',
    style: 'retro',
    color: '#FF00FF',
    totalDuration: 24,
    mediaCount: 8,
    slots: [
      { slotType: 'any', duration: 3, transition: 'glitch', effect: 'static', holdPoint: 'center' },
      { slotType: 'any', duration: 2.5, transition: 'glitch', effect: 'pan-left', holdPoint: 'face' },
      { slotType: 'any', duration: 4, transition: 'fade', effect: 'slow-zoom', holdPoint: 'center' },
      { slotType: 'any', duration: 2.5, transition: 'glitch', effect: 'static', holdPoint: 'face' },
      { slotType: 'any', duration: 3, transition: 'glitch', effect: 'pan-right', holdPoint: 'center' },
      { slotType: 'any', duration: 3, transition: 'fade', effect: 'ken-burns', holdPoint: 'face' },
      { slotType: 'any', duration: 3, transition: 'glitch', effect: 'static', holdPoint: 'center' },
      { slotType: 'any', duration: 3, transition: 'fade', effect: 'slow-zoom', holdPoint: 'face' },
    ],
  },
  {
    id: 'cyber-glitch',
    name: 'Cyber Glitch',
    description: 'Digital chaos. RGB splits, data corruption, and neon accents. For the bold.',
    style: 'glitch',
    color: '#00FFFF',
    totalDuration: 18,
    mediaCount: 10,
    slots: [
      { slotType: 'any', duration: 1.5, transition: 'glitch', effect: 'bounce', holdPoint: 'center' },
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
  {
    id: 'depth-parallax',
    name: '3D Parallax',
    description: 'Layered depth illusion with smooth panning. Faces auto-centered. Premium editorial feel.',
    style: 'parallax',
    color: '#7C3AED',
    totalDuration: 30,
    mediaCount: 7,
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
