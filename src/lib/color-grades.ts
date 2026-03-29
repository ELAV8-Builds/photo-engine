/**
 * Color Grades — named LUT-style presets for the TemplateMixer.
 *
 * Each grade is a set of CSS filter + overlay combos that get applied
 * via the post-processing colorGrade effect. This file is the single
 * source of truth for the UI picker + the actual rendering.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ColorGradePreset {
  id: string;
  name: string;
  /** Short description */
  description: string;
  /** Preview color for UI chip */
  chipColor: string;
  /** CSS filter string */
  filter: string;
  /** Optional tint overlay (rgba) */
  overlay?: string;
  /** Category for grouping */
  category: 'cinematic' | 'mood' | 'vintage' | 'bold';
}

// ---------------------------------------------------------------------------
// Presets
// ---------------------------------------------------------------------------

export const COLOR_GRADE_PRESETS: ColorGradePreset[] = [
  // ── Cinematic ──
  {
    id: 'warm-cinematic',
    name: 'Warm Cinematic',
    description: 'Golden skin tones, rich shadows — classic film look',
    chipColor: '#FFB050',
    filter: 'contrast(1.1) saturate(1.2) sepia(0.15)',
    overlay: 'rgba(255,180,80,0.06)',
    category: 'cinematic',
  },
  {
    id: 'cool-teal',
    name: 'Cool Teal',
    description: 'Teal shadows, desaturated highlights — modern cinema',
    chipColor: '#00B4C8',
    filter: 'contrast(1.05) saturate(0.9) hue-rotate(-10deg)',
    overlay: 'rgba(0,180,200,0.05)',
    category: 'cinematic',
  },
  {
    id: 'bleach-bypass',
    name: 'Bleach Bypass',
    description: 'Low saturation, crushed blacks — gritty dramatic look',
    chipColor: '#A0A0A0',
    filter: 'contrast(1.25) saturate(0.5) brightness(0.95)',
    category: 'cinematic',
  },
  {
    id: 'high-contrast',
    name: 'High Contrast',
    description: 'Punchy blacks and whites with vivid midtones',
    chipColor: '#FFFFFF',
    filter: 'contrast(1.3) saturate(1.1) brightness(0.95)',
    category: 'cinematic',
  },

  // ── Mood ──
  {
    id: 'golden-hour',
    name: 'Golden Hour',
    description: 'Warm sunset glow — romantic and dreamy',
    chipColor: '#FF8C00',
    filter: 'saturate(1.2) brightness(1.08) sepia(0.18)',
    overlay: 'rgba(255,140,0,0.07)',
    category: 'mood',
  },
  {
    id: 'moonlit',
    name: 'Moonlit',
    description: 'Cool blue tones — midnight atmosphere',
    chipColor: '#6688CC',
    filter: 'contrast(1.05) saturate(0.8) brightness(0.9) hue-rotate(-15deg)',
    overlay: 'rgba(80,120,200,0.06)',
    category: 'mood',
  },
  {
    id: 'pastel-dream',
    name: 'Pastel Dream',
    description: 'Soft pastels, lifted blacks — airy and light',
    chipColor: '#C896FF',
    filter: 'contrast(0.85) saturate(0.6) brightness(1.15)',
    overlay: 'rgba(200,150,255,0.04)',
    category: 'mood',
  },
  {
    id: 'neon-night',
    name: 'Neon Night',
    description: 'Crushed blacks, hyper-saturated — cyberpunk vibes',
    chipColor: '#6400FF',
    filter: 'contrast(1.2) saturate(1.5) brightness(0.9)',
    overlay: 'rgba(100,0,255,0.05)',
    category: 'mood',
  },

  // ── Vintage ──
  {
    id: 'vintage-fade',
    name: 'Vintage Fade',
    description: 'Faded film stock with lifted blacks and warm tone',
    chipColor: '#C8B478',
    filter: 'contrast(0.9) saturate(0.7) sepia(0.3) brightness(1.05)',
    overlay: 'rgba(200,180,120,0.08)',
    category: 'vintage',
  },
  {
    id: 'retro-vhs',
    name: 'Retro VHS',
    description: 'Color bleed, low-fi — 80s home video feeling',
    chipColor: '#FF00FF',
    filter: 'saturate(0.6) contrast(1.2) sepia(0.25) hue-rotate(5deg)',
    overlay: 'rgba(255,0,255,0.04)',
    category: 'vintage',
  },
  {
    id: 'polaroid',
    name: 'Polaroid',
    description: 'Warm shadows, cool highlights — instant film nostalgia',
    chipColor: '#E8D8C0',
    filter: 'contrast(1.05) saturate(0.85) sepia(0.12) brightness(1.05)',
    overlay: 'rgba(220,200,160,0.06)',
    category: 'vintage',
  },

  // ── Bold ──
  {
    id: 'electric-pop',
    name: 'Electric Pop',
    description: 'Ultra-vivid colors — maximum impact',
    chipColor: '#00FF88',
    filter: 'contrast(1.15) saturate(1.6) brightness(1.02)',
    category: 'bold',
  },
  {
    id: 'infrared',
    name: 'Infrared',
    description: 'Red-shifted, otherworldly — heat vision look',
    chipColor: '#FF4040',
    filter: 'contrast(1.1) saturate(1.3) hue-rotate(30deg) sepia(0.1)',
    overlay: 'rgba(255,60,60,0.04)',
    category: 'bold',
  },
  {
    id: 'cross-process',
    name: 'Cross Process',
    description: 'Shifted colors with green shadows — experimental',
    chipColor: '#80FF60',
    filter: 'contrast(1.15) saturate(1.2) hue-rotate(-25deg) brightness(1.05)',
    overlay: 'rgba(120,255,80,0.03)',
    category: 'bold',
  },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Get a color grade by ID */
export function getColorGrade(id: string): ColorGradePreset | undefined {
  return COLOR_GRADE_PRESETS.find((g) => g.id === id);
}

/** Get all grade IDs */
export function getColorGradeIds(): string[] {
  return COLOR_GRADE_PRESETS.map((g) => g.id);
}

/** Get grades by category */
export function getColorGradesByCategory(
  category: ColorGradePreset['category'],
): ColorGradePreset[] {
  return COLOR_GRADE_PRESETS.filter((g) => g.category === category);
}

/** Get all categories */
export function getColorGradeCategories(): ColorGradePreset['category'][] {
  return ['cinematic', 'mood', 'vintage', 'bold'];
}
