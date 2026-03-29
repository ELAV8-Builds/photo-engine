/**
 * Google Fonts loading and management.
 *
 * Loads fonts dynamically via the Google Fonts CSS API.
 * Fonts are cached by the browser after first load.
 */

// ---------------------------------------------------------------------------
// Font definitions
// ---------------------------------------------------------------------------

export interface FontDef {
  family: string;
  weights: number[];
  /** Google Fonts family name (may differ from CSS name) */
  googleName: string;
  /** Category for UI grouping */
  category: 'display' | 'sans' | 'serif' | 'mono' | 'handwriting';
}

export const FONTS: FontDef[] = [
  { family: 'Inter', weights: [400, 700, 900], googleName: 'Inter', category: 'sans' },
  { family: 'Bebas Neue', weights: [400], googleName: 'Bebas+Neue', category: 'display' },
  { family: 'Oswald', weights: [400, 700], googleName: 'Oswald', category: 'display' },
  { family: 'Playfair Display', weights: [400, 700, 900], googleName: 'Playfair+Display', category: 'serif' },
  { family: 'Montserrat', weights: [400, 700, 900], googleName: 'Montserrat', category: 'sans' },
  { family: 'Poppins', weights: [400, 600, 700, 900], googleName: 'Poppins', category: 'sans' },
  { family: 'Raleway', weights: [400, 700, 900], googleName: 'Raleway', category: 'sans' },
  { family: 'Permanent Marker', weights: [400], googleName: 'Permanent+Marker', category: 'handwriting' },
  { family: 'Anton', weights: [400], googleName: 'Anton', category: 'display' },
  { family: 'Abril Fatface', weights: [400], googleName: 'Abril+Fatface', category: 'display' },
  { family: 'Russo One', weights: [400], googleName: 'Russo+One', category: 'display' },
  { family: 'Space Mono', weights: [400, 700], googleName: 'Space+Mono', category: 'mono' },
  { family: 'Lora', weights: [400, 700], googleName: 'Lora', category: 'serif' },
  { family: 'Archivo Black', weights: [400], googleName: 'Archivo+Black', category: 'display' },
];

// ---------------------------------------------------------------------------
// Font loading
// ---------------------------------------------------------------------------

const loadedFonts = new Set<string>();
let linkElement: HTMLLinkElement | null = null;

/**
 * Load a font from Google Fonts. Idempotent — loads only once per family.
 */
export function loadFont(family: string): void {
  if (typeof document === 'undefined') return;
  if (loadedFonts.has(family)) return;

  const fontDef = FONTS.find((f) => f.family === family);
  if (!fontDef) return;

  loadedFonts.add(family);

  // Append to existing link or create new one
  const weights = fontDef.weights.join(';');
  const url = `https://fonts.googleapis.com/css2?family=${fontDef.googleName}:wght@${weights}&display=swap`;

  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = url;
  document.head.appendChild(link);
}

/**
 * Load all fonts used by text style presets.
 */
export function loadAllFonts(): void {
  FONTS.forEach((f) => loadFont(f.family));
}

/**
 * Load a specific set of fonts by family names.
 */
export function loadFonts(families: string[]): void {
  families.forEach(loadFont);
}

/**
 * Check if a font is loaded and available.
 */
export async function isFontReady(family: string): Promise<boolean> {
  if (typeof document === 'undefined') return false;
  try {
    return document.fonts.check(`16px "${family}"`);
  } catch {
    return false;
  }
}

/**
 * Wait for a font to be available (with timeout).
 */
export async function waitForFont(family: string, timeoutMs = 5000): Promise<boolean> {
  if (typeof document === 'undefined') return false;

  loadFont(family);

  try {
    await Promise.race([
      document.fonts.load(`400 16px "${family}"`),
      new Promise((_, reject) => setTimeout(() => reject(new Error('Font load timeout')), timeoutMs)),
    ]);
    return true;
  } catch {
    console.warn(`[Fonts] Failed to load "${family}" within ${timeoutMs}ms`);
    return false;
  }
}

/**
 * Get all available font families.
 */
export function getFontFamilies(): string[] {
  return FONTS.map((f) => f.family);
}

/**
 * Get fonts by category.
 */
export function getFontsByCategory(category: FontDef['category']): FontDef[] {
  return FONTS.filter((f) => f.category === category);
}
