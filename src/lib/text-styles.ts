/**
 * Text Style Presets — predefined visual styles for text overlays.
 *
 * Each preset defines font family, weight, color scheme, effects,
 * and background treatment. These replace plain text entirely —
 * text should NEVER be shown without a style applied.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TextStylePreset {
  id: string;
  name: string;
  /** Font family (from fonts.ts) */
  fontFamily: string;
  /** Font weight */
  fontWeight: number;
  /** Text color (CSS) */
  color: string;
  /** Optional gradient (overrides color if set) */
  gradient?: { from: string; to: string; angle?: number };
  /** Glow/shadow color */
  glowColor?: string;
  /** Glow blur radius */
  glowSize?: number;
  /** Text stroke (outline) */
  stroke?: { color: string; width: number };
  /** Background behind text */
  background?: {
    color: string;
    paddingX: number;
    paddingY: number;
    borderRadius: number;
    /** Glass/blur effect */
    glass?: boolean;
  };
  /** Letter spacing (em) */
  letterSpacing?: number;
  /** Text transform */
  textTransform?: 'uppercase' | 'lowercase' | 'none';
  /** Drop shadow */
  dropShadow?: { x: number; y: number; blur: number; color: string };
  /** Emboss effect (simulated with double-render) */
  emboss?: boolean;
  /** Category for UI grouping */
  category: 'bold' | 'elegant' | 'neon' | 'retro' | 'minimal' | 'fun';
  /** Preview description */
  description: string;
}

// ---------------------------------------------------------------------------
// Presets
// ---------------------------------------------------------------------------

export const TEXT_STYLE_PRESETS: TextStylePreset[] = [
  // === BOLD ===
  {
    id: 'impact-white',
    name: 'Impact White',
    fontFamily: 'Bebas Neue',
    fontWeight: 400,
    color: '#FFFFFF',
    stroke: { color: '#000000', width: 3 },
    dropShadow: { x: 2, y: 3, blur: 6, color: 'rgba(0,0,0,0.7)' },
    letterSpacing: 0.05,
    textTransform: 'uppercase',
    category: 'bold',
    description: 'Classic bold white with black outline',
  },
  {
    id: 'gold-emboss',
    name: 'Gold Emboss',
    fontFamily: 'Oswald',
    fontWeight: 700,
    color: '#FFD700',
    glowColor: 'rgba(255,215,0,0.4)',
    glowSize: 20,
    emboss: true,
    dropShadow: { x: 1, y: 2, blur: 4, color: 'rgba(0,0,0,0.6)' },
    textTransform: 'uppercase',
    letterSpacing: 0.08,
    category: 'bold',
    description: 'Golden text with emboss and glow',
  },
  {
    id: 'heavy-black',
    name: 'Heavy Black',
    fontFamily: 'Anton',
    fontWeight: 400,
    color: '#000000',
    background: { color: 'rgba(255,255,255,0.95)', paddingX: 20, paddingY: 8, borderRadius: 4 },
    textTransform: 'uppercase',
    letterSpacing: 0.04,
    category: 'bold',
    description: 'Black text on white background bar',
  },

  // === ELEGANT ===
  {
    id: 'serif-gold',
    name: 'Serif Gold',
    fontFamily: 'Playfair Display',
    fontWeight: 700,
    color: '#FFD700',
    glowColor: 'rgba(255,215,0,0.2)',
    glowSize: 15,
    letterSpacing: 0.02,
    category: 'elegant',
    description: 'Elegant serif in gold',
  },
  {
    id: 'glass-panel',
    name: 'Glass Panel',
    fontFamily: 'Montserrat',
    fontWeight: 600,
    color: '#FFFFFF',
    background: {
      color: 'rgba(255,255,255,0.1)',
      paddingX: 24,
      paddingY: 12,
      borderRadius: 12,
      glass: true,
    },
    dropShadow: { x: 0, y: 1, blur: 3, color: 'rgba(0,0,0,0.3)' },
    letterSpacing: 0.03,
    category: 'elegant',
    description: 'White text on frosted glass',
  },
  {
    id: 'thin-serif',
    name: 'Thin Serif',
    fontFamily: 'Lora',
    fontWeight: 400,
    color: '#FFFFFF',
    glowColor: 'rgba(255,255,255,0.15)',
    glowSize: 10,
    letterSpacing: 0.06,
    textTransform: 'uppercase',
    category: 'elegant',
    description: 'Delicate serif with subtle glow',
  },

  // === NEON ===
  {
    id: 'neon-pink',
    name: 'Neon Pink',
    fontFamily: 'Poppins',
    fontWeight: 700,
    color: '#FF00FF',
    glowColor: 'rgba(255,0,255,0.6)',
    glowSize: 30,
    category: 'neon',
    description: 'Hot pink neon glow',
  },
  {
    id: 'neon-cyan',
    name: 'Neon Cyan',
    fontFamily: 'Russo One',
    fontWeight: 400,
    color: '#00FFFF',
    glowColor: 'rgba(0,255,255,0.5)',
    glowSize: 25,
    textTransform: 'uppercase',
    letterSpacing: 0.1,
    category: 'neon',
    description: 'Electric cyan neon',
  },
  {
    id: 'neon-green',
    name: 'Neon Green',
    fontFamily: 'Montserrat',
    fontWeight: 900,
    color: '#39FF14',
    glowColor: 'rgba(57,255,20,0.5)',
    glowSize: 25,
    textTransform: 'uppercase',
    category: 'neon',
    description: 'Matrix-style green neon',
  },

  // === RETRO ===
  {
    id: 'retro-gradient',
    name: 'Retro Gradient',
    fontFamily: 'Archivo Black',
    fontWeight: 400,
    color: '#FF6B6B',
    gradient: { from: '#FF6B6B', to: '#FFA500', angle: 180 },
    dropShadow: { x: 3, y: 3, blur: 0, color: 'rgba(0,0,0,0.5)' },
    textTransform: 'uppercase',
    category: 'retro',
    description: 'Sunset gradient with hard shadow',
  },
  {
    id: 'vhs-glitch',
    name: 'VHS Glitch',
    fontFamily: 'Space Mono',
    fontWeight: 700,
    color: '#FFFFFF',
    stroke: { color: '#FF0000', width: 1 },
    dropShadow: { x: -2, y: 0, blur: 0, color: '#00FFFF' },
    letterSpacing: 0.02,
    textTransform: 'uppercase',
    category: 'retro',
    description: 'VHS tracking error effect',
  },

  // === MINIMAL ===
  {
    id: 'clean-white',
    name: 'Clean White',
    fontFamily: 'Inter',
    fontWeight: 700,
    color: '#FFFFFF',
    dropShadow: { x: 0, y: 1, blur: 8, color: 'rgba(0,0,0,0.5)' },
    category: 'minimal',
    description: 'Clean white with soft shadow',
  },
  {
    id: 'subtle-caps',
    name: 'Subtle Caps',
    fontFamily: 'Raleway',
    fontWeight: 400,
    color: 'rgba(255,255,255,0.85)',
    letterSpacing: 0.2,
    textTransform: 'uppercase',
    category: 'minimal',
    description: 'Wide-spaced minimal caps',
  },

  // === FUN ===
  {
    id: 'marker',
    name: 'Marker',
    fontFamily: 'Permanent Marker',
    fontWeight: 400,
    color: '#FFFFFF',
    dropShadow: { x: 2, y: 2, blur: 4, color: 'rgba(0,0,0,0.6)' },
    category: 'fun',
    description: 'Handwritten marker style',
  },
  {
    id: 'party-gradient',
    name: 'Party Gradient',
    fontFamily: 'Poppins',
    fontWeight: 900,
    color: '#FF00FF',
    gradient: { from: '#FF00FF', to: '#00FFFF', angle: 90 },
    glowColor: 'rgba(255,0,255,0.3)',
    glowSize: 15,
    textTransform: 'uppercase',
    category: 'fun',
    description: 'Pink-to-cyan party gradient',
  },
];

/**
 * Get a text style preset by ID.
 */
export function getTextStyle(id: string): TextStylePreset | undefined {
  return TEXT_STYLE_PRESETS.find((p) => p.id === id);
}

/**
 * Get presets by category.
 */
export function getTextStylesByCategory(category: TextStylePreset['category']): TextStylePreset[] {
  return TEXT_STYLE_PRESETS.filter((p) => p.category === category);
}

/**
 * Get all categories with their presets.
 */
export function getTextStyleCategories(): { category: string; presets: TextStylePreset[] }[] {
  const categories: TextStylePreset['category'][] = ['bold', 'elegant', 'neon', 'retro', 'minimal', 'fun'];
  return categories.map((cat) => ({
    category: cat,
    presets: getTextStylesByCategory(cat),
  }));
}
