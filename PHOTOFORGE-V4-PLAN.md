# PhotoForge v4.0 — Master Upgrade Plan

## Vision
Transform PhotoForge from a basic slideshow maker into a professional-grade motion content creator that rivals Insta360 Shot Lab and CapCut — with persistent project management, a song library, modular template mixing, and a cinematic text design system.

---

## Table of Contents
1. [Effects Engine v4.0](#1-effects-engine-v40)
2. [Song Library](#2-song-library)
3. [Project Manager](#3-project-manager)
4. [Text Design System](#4-text-design-system)
5. [Modular Template Mixer](#5-modular-template-mixer)
6. [HEIC Bug Fix](#6-heic-bug-fix)
7. [Video Segment Selector](#7-video-segment-selector)
8. [Face Detection Upgrade](#8-face-detection-upgrade)
9. [Updated Data Model](#9-updated-data-model)
10. [New File Structure](#10-new-file-structure)
11. [Build Phases](#11-build-phases)
12. [Storage Architecture](#12-storage-architecture)

---

## 1. Effects Engine v4.0

### Problem
Current effects are glorified PowerPoint:
- `ken-burns` = 15% linear zoom
- `slow-zoom` = same thing, centered
- `parallax` = 40px horizontal nudge
- `pan-left/right` = 8% width translation
- `bounce` = sine wave zoom 1.05x-1.1x
- `static` = literally nothing

Transitions are equally basic: cross-dissolve, linear push, scale+fade, random flicker.

### Solution: Multi-Pass Compositing Pipeline

#### Architecture
```
Raw Image → Offscreen Canvas A (motion transform)
         → Offscreen Canvas B (post-processing stack)
         → Output Canvas (overlays, particles, text)
```

Three offscreen canvases enable multi-pass effects (bloom, motion blur, chromatic aberration) without destroying the source frame.

#### A. Advanced Motion Effects (20+)

**Camera Movements:**
| Effect | What It Does |
|--------|-------------|
| `dolly-in` | Smooth zoom to subject with cubic easing (not linear) |
| `dolly-out` | Pull back reveal with deceleration |
| `orbit` | Circular pan around focus point (face/center) |
| `crane-up` | Vertical upward tilt |
| `crane-down` | Vertical downward tilt |
| `whip-pan` | Fast horizontal swipe with motion blur |
| `rack-focus` | Simulated depth-of-field shift (blur edges → center) |

**Dynamic Effects:**
| Effect | What It Does |
|--------|-------------|
| `speed-ramp` | Variable speed: slow→FAST→slow (key to Insta360 look) |
| `pulse-zoom` | Rhythmic zoom in/out (beat-sync ready) |
| `drift` | Subtle random wandering (handheld camera feel) |
| `tilt-shift` | Selective blur creating miniature effect |
| `split-screen` | Image duplicated with different timing per half |

**Film Effects:**
| Effect | What It Does |
|--------|-------------|
| `film-grain` | Animated noise overlay, adjustable intensity |
| `chromatic-aberration` | RGB channel offset that shifts during movement |
| `bloom` | Bright areas glow and bleed (screen composite) |
| `lens-flare` | Animated light streak across frame |
| `light-leak` | Warm/cool color wash sweep |

**Clone/Echo:**
| Effect | What It Does |
|--------|-------------|
| `echo-trail` | Previous frame ghosting (ring buffer at decreasing opacity) |
| `mirror` | Kaleidoscope/mirror with rotation |
| `pixelate-reveal` | Large pixels → full resolution reveal |

All backwards compatible — legacy effects (`ken-burns`, `parallax`, etc.) still work.

#### B. Cinematic Transitions (15+)

**Warp Transitions:**
- `morph-dissolve` — Pixel displacement map transition
- `radial-wipe` — Circular reveal from center/edges
- `clock-wipe` — Rotational reveal
- `iris-wipe` — Classic film iris open/close
- `curtain` — Vertical/horizontal curtain pull

**3D-Style (Canvas 2D tricks):**
- `page-curl` — Simulated page turn with perspective math
- `cube-rotate` — Fake 3D cube rotation (skew transforms)
- `flip-card` — Horizontal flip with perspective
- `shatter` — Image breaks into grid cells that scatter
- `swirl` — Spiral distortion

**Energy Transitions:**
- `whip-blur` — Horizontal motion blur bridge
- `flash-white` / `flash-black` — Quick flash between images
- `rgb-split-wipe` — RGB channels slide independently
- `glitch-blocks` — Rectangular block scramble
- `pixelate-crossfade` — Both images pixelate, cross, resolve

**Timing Upgrade:**
- Per-transition configurable duration (0.2s to 1.5s, up from fixed 0.4s)
- Easing curves: `linear`, `ease-in`, `ease-out`, `ease-in-out`, `spring`, `bounce-back`, `snap`
- Asymmetric timing: different ease for in vs out

#### C. Post-Processing Stack

Ordered array of passes run AFTER each frame:

| Pass | What It Does |
|------|-------------|
| `color-grade` | LUT-style transforms: lift/gamma/gain, temp/tint, highlight/shadow color |
| `motion-blur` | Ring buffer of last 3 frames composited at decreasing opacity |
| `film-grain` | Per-frame animated noise (not static overlay) |
| `chromatic-aberration` | Draw image 3x with R/G/B offsets |
| `bloom` | Downscale brights → blur → screen composite back |
| `vignette-pulse` | Animated vignette that pulses and shifts shape |
| `letterbox` | Animated cinematic bars that slide in/out |
| `scanlines` | Properly animated CRT scanlines |
| `light-leak` | Semi-transparent gradient overlays sweeping across |
| `lens-flare` | Light streaks at configurable angle/intensity |

Templates define an effects pipeline — ordered array of these passes. This is what separates "basic slideshow" from "Insta360-quality."

#### D. Speed Ramping System

Instead of linear time: `t = frame / totalFrames`, use a speed curve function:
- `speedCurve: number[]` — keyframe speed multipliers
- `slowMoFactor` — 0.3 = 30% speed for slow sections
- Easing between keypoints for smooth ramping
- This is the single most impactful feature for making output look dramatic

---

## 2. Song Library

### Problem
Currently, songs are ephemeral — ripped from YouTube or uploaded, used once, then lost. Users have to re-download the same song every time.

### Solution: Persistent Song Library with IndexedDB

#### Storage
- All audio files stored in **IndexedDB** (browser-local, persists across sessions)
- Metadata stored alongside: title, artist, duration, source, tags, date added
- No server-side storage needed for the library itself (YouTube rips still go to `public/audio/` for the session, then get saved to IndexedDB)

#### Data Model
```typescript
interface LibrarySong {
  id: string;
  name: string;
  artist?: string;
  duration: number;
  source: 'upload' | 'youtube';
  sourceUrl?: string;       // YouTube URL for re-download reference
  tags: string[];            // e.g., 'chill', 'upbeat', 'cinematic'
  bpm?: number;              // for beat-sync features later
  dateAdded: string;         // ISO timestamp
  audioBlob: Blob;           // The actual audio data
  thumbnailUrl?: string;     // Album art if available
}
```

#### UI Changes

**Music Step gets a new section: "Your Library"**
- Grid/list of saved songs with play preview, duration, source badge
- Search by name/tags
- Sort by: date added, name, duration
- Delete songs from library
- "Save to Library" button appears after ripping/uploading a song
- Auto-save option: toggle to automatically save every song

**New API route:**
- `POST /api/youtube-audio` — existing, but now also returns the blob data for IndexedDB storage

#### Library Service (`src/lib/song-library.ts`)
```typescript
class SongLibrary {
  static async getAll(): Promise<LibrarySong[]>
  static async getById(id: string): Promise<LibrarySong | null>
  static async save(song: LibrarySong): Promise<void>
  static async delete(id: string): Promise<void>
  static async search(query: string): Promise<LibrarySong[]>
  static async getByTags(tags: string[]): Promise<LibrarySong[]>
}
```

Uses `idb` wrapper or raw IndexedDB API (zero dependencies).

---

## 3. Project Manager

### Problem
Projects are completely ephemeral. Close the tab = lose everything. No way to save, revisit, edit, or rebuild a project.

### Solution: Full Project Persistence with IndexedDB

#### Storage
All project data stored in **IndexedDB**:
- Project metadata (template, settings, text overrides)
- Media references (stored as Blobs in IndexedDB)
- Music reference (link to song library entry or embedded Blob)
- Exported video Blobs (optional — user can choose to save exports)

#### Data Model
```typescript
interface SavedProject {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;

  // Core settings
  templateId: string;
  aspectRatio: '16:9' | '9:16' | '1:1';
  outputQuality: '720p' | '1080p' | '4k';
  title: string;

  // Template mixer overrides (see Section 5)
  mixerOverrides?: TemplateMixerState;

  // Media
  media: SavedMediaRef[];

  // Music
  musicId?: string;            // Reference to song library
  musicBlob?: Blob;            // Or embedded audio
  musicName?: string;

  // Text
  textOverrides: Record<number, string | null>;

  // Export
  lastExportUrl?: string;      // Blob URL of last export
  lastExportBlob?: Blob;       // Saved export video
  thumbnailBlob?: Blob;        // Auto-captured thumbnail

  // Tags for organization
  tags: string[];
}

interface SavedMediaRef {
  id: string;
  name: string;
  blob: Blob;                  // Actual image/video data
  width: number;
  height: number;
  type: 'photo' | 'video';
  faces: FaceRegion[];
  order: number;
  selected: boolean;
  duration?: number;
  trimStart?: number;
  trimEnd?: number;
}
```

#### UI: Project Manager Page

**New route: `/projects` (or modal overlay)**

Features:
- **Project Grid** — thumbnail cards showing project name, template, date, media count
- **Search** — by name, tags, template name
- **Sort** — by date (newest first), name, template
- **Actions per project:**
  - *Open* — loads project back into the editor with all media/settings
  - *Duplicate* — clone project for variations
  - *Delete* — with confirmation
  - *Export* — re-export with current settings
  - *Change Template* — load project but swap the template (keeps media/music)
- **Bulk actions** — select multiple, delete, tag
- **Storage indicator** — show how much IndexedDB space is used

#### Auto-Save
- Projects auto-save to IndexedDB after every step change
- Draft projects (not yet exported) are marked differently
- "Save as New" creates a copy when editing an existing project

#### Project Service (`src/lib/project-manager.ts`)
```typescript
class ProjectManager {
  static async getAll(): Promise<SavedProject[]>
  static async getById(id: string): Promise<SavedProject | null>
  static async save(project: SavedProject): Promise<void>
  static async delete(id: string): Promise<void>
  static async duplicate(id: string): Promise<SavedProject>
  static async search(query: string): Promise<SavedProject[]>
  static async getStorageUsage(): Promise<{ used: number; available: number }>
  static async exportProject(id: string): Promise<Blob>  // JSON export for backup
  static async importProject(data: Blob): Promise<SavedProject>
}
```

#### Navigation Change
- Header gets a "Projects" button/link
- New step flow: Projects → Media → Template → Music → Render
- Or: click existing project → jumps to where they left off

---

## 4. Text Design System

### Problem
Beau: "We should never just show text. The text should always have some cool design to it with different modern fonts, bold embossed, whatever shadowed and they should move in or electrify in."

Current text is Inter font with basic animations (fade, slide, typewriter, scale-pop, glitch). No style variety.

### Solution: Styled Text Presets + Rich Animation Library

#### A. Font Library

Load multiple Google Fonts for variety:

| Font | Style | Use For |
|------|-------|---------|
| Space Grotesk | Modern geometric sans | Clean/minimal templates |
| Bebas Neue | Bold condensed all-caps | Impact titles, party |
| Playfair Display | Elegant serif | Golden hour, cinematic |
| Orbitron | Futuristic tech | Cyber, neon, electric |
| Permanent Marker | Handwritten bold | Summer, party, fun |
| Cinzel | Classical serif | Elegant, formal |
| Raleway | Thin modern sans | Minimal, subtle |
| Anton | Ultra bold display | Big impact statements |
| Press Start 2P | Pixel/retro | Retro VHS |
| JetBrains Mono | Monospace | Tech/cyber templates |

Loaded via `next/font/google` or `<link>` with font-display: swap.

#### B. Text Style Presets

Each text overlay gets a `textStyle` that defines the complete visual treatment:

```typescript
interface TextStyle {
  fontFamily: string;
  fontWeight: number;
  letterSpacing: number;       // em units
  textTransform?: 'uppercase' | 'lowercase' | 'capitalize' | 'none';

  // Visual treatments
  fill: TextFill;
  stroke?: { color: string; width: number };
  shadow?: TextShadow[];

  // Background
  background?: {
    color: string;
    padding: [number, number, number, number]; // t,r,b,l in px
    borderRadius: number;
    blur?: number;             // backdrop blur
  };
}

type TextFill =
  | { type: 'solid'; color: string }
  | { type: 'gradient'; colors: string[]; angle: number }
  | { type: 'outline'; color: string; strokeWidth: number };

interface TextShadow {
  offsetX: number;
  offsetY: number;
  blur: number;
  color: string;
}
```

**Built-in Style Presets:**

| Preset | Look |
|--------|------|
| `neon-glow` | Orbitron, electric glow shadow, gradient fill |
| `embossed` | Bebas Neue, multi-layer shadow (highlight + shadow) for 3D look |
| `glass` | Space Grotesk, frosted glass background, subtle stroke |
| `fire` | Anton, gradient fill (yellow→orange→red), warm glow |
| `ice` | Cinzel, gradient fill (white→cyan→blue), cold glow |
| `retro-pixel` | Press Start 2P, pixel-perfect, CRT green glow |
| `gold-foil` | Playfair Display, gold gradient fill, emboss shadow |
| `chalk` | Permanent Marker, white with rough edge (slight offset duplicates) |
| `electric` | Orbitron, cyan stroke, electric glow, animated flicker |
| `minimal-clean` | Raleway thin, no effects, just beautiful type |
| `bold-impact` | Anton uppercase, solid white, heavy shadow |
| `cinematic-serif` | Playfair Display italic, warm white, subtle glow |
| `glitch-cyber` | JetBrains Mono, RGB-split rendering, scanline overlay |
| `gradient-modern` | Space Grotesk bold, multi-color gradient fill |

#### C. Text Animation Library (Expanded)

Current: `fade-in`, `slide-up`, `typewriter`, `scale-pop`, `glitch-in`, `none`

**New animations:**

| Animation | What It Does |
|-----------|-------------|
| `slide-down` | Drops in from above |
| `slide-left` / `slide-right` | Horizontal entrance |
| `letter-by-letter` | Each letter animates in separately with stagger |
| `word-by-word` | Each word animates in with stagger |
| `bounce-in` | Spring physics entrance |
| `elastic-pop` | Overshoot → undershoot → settle (rubber band) |
| `spin-in` | Rotates from 0° to 360° while scaling in |
| `wave` | Letters wave up/down in sequence (continuous) |
| `shake` | Rapid horizontal shake then settle |
| `flicker` | Randomized opacity flicker (neon sign) |
| `electric-zap` | Lightning bolt flash → text appears → residual flicker |
| `shatter-in` | Letters start scattered/rotated, snap into place |
| `blur-reveal` | Text goes from blurry to sharp |
| `3d-flip` | Each letter flips in from top (faux 3D) |
| `matrix-rain` | Characters cascade down then snap into final text |
| `stroke-draw` | Outline draws itself, then fills with color |
| `split-reveal` | Two halves of text slide apart to reveal |

#### D. Canvas Rendering Updates

The `text-renderer.ts` gets a complete rewrite:
- Each style preset maps to specific canvas drawing operations
- Gradient fills use `ctx.createLinearGradient()`
- Emboss uses multiple `fillText()` calls at offsets
- Stroke uses `ctx.strokeText()`
- Glass background uses translucent `fillRect()` before text
- New animations use per-character rendering with `ctx.measureText()` for precise positioning

#### E. Template Text Defaults

Each template specifies which text style and animation to use:
```typescript
interface TextOverlay {
  text: string;
  position: 'top' | 'center' | 'bottom';
  fontSize: 'sm' | 'md' | 'lg' | 'xl';
  fontWeight: 'normal' | 'bold' | 'black';  // legacy, style preset overrides
  animation: TextAnimation;       // expanded union type
  color: string;                  // legacy fallback
  glowColor?: string;             // legacy fallback
  textStyle?: string;             // preset name, e.g. 'neon-glow'
}
```

---

## 5. Modular Template Mixer

### Problem
Beau: "Maybe we should be able to swap in and out different features of the templates so they become many more options than just 12 by using one component of one or another of another."

Currently: 12 fixed templates. You get what you get.

### Solution: Component-Based Template Mixing

#### Concept
Every template is decomposed into swappable "layers":

```
Template = Motion Layer + Transition Layer + Post-Processing Layer + Particle Layer + Text Style Layer + Color Grade Layer
```

Users start with a template preset (e.g., "Cinematic Journey") but can swap out ANY layer independently.

#### Mixer State
```typescript
interface TemplateMixerState {
  // Base template (starting point)
  baseTemplateId: string;

  // Override layers (null = use base template default)
  motionOverride?: MotionEffect;           // e.g., swap ken-burns for orbit
  transitionOverride?: TransitionEffect;    // e.g., swap fade for iris-wipe
  postEffectsOverride?: PostEffectConfig[]; // e.g., add chromatic aberration
  particleOverride?: ParticleType;          // e.g., swap snow for sparks
  textStyleOverride?: string;               // e.g., swap to 'neon-glow'
  colorGradeOverride?: ColorGradePreset;    // e.g., swap warm for cool

  // Per-slot overrides (for fine-tuning individual slots)
  slotOverrides?: Record<number, Partial<SlotOverride>>;
}

interface SlotOverride {
  motion: MotionEffect;
  transition: TransitionEffect;
  duration: number;
  postEffects: PostEffectConfig[];
}
```

#### UI: Template Mixer Panel

When a template is selected, a "Customize" / "Mix" button appears. Opens a panel with:

**Layer Swapper:**
```
┌─────────────────────────────────────┐
│  🎬 Cinematic Journey (base)        │
├─────────────────────────────────────┤
│  Motion:      [dolly-in     ▾]      │  ← dropdown with all 20+ motions
│  Transitions: [iris-wipe    ▾]      │  ← dropdown with all 15+ transitions
│  Particles:   [none         ▾]      │  ← dropdown: none, confetti, snow, etc.
│  Post FX:     [+ Add Effect]        │  ← multi-select: bloom, grain, etc.
│  Text Style:  [neon-glow    ▾]      │  ← dropdown with all 14+ presets
│  Color Grade: [warm cinematic ▾]    │  ← dropdown with grade presets
├─────────────────────────────────────┤
│  [Reset to Default] [Save as Preset]│
└─────────────────────────────────────┘
```

**Result:** 12 base templates × 20 motions × 15 transitions × 7 particles × 14 text styles × 8 color grades = **~2.8 million possible combinations**.

Users don't see that number — they see: "I want the Cinematic Journey template but with confetti and the neon text style." Simple swaps, massive variety.

#### Color Grade Presets
```typescript
type ColorGradePreset =
  | 'warm-cinematic'    // golden warm
  | 'cool-teal'         // teal shadows, orange highlights
  | 'vintage-fade'      // lifted blacks, desaturated
  | 'high-contrast'     // crushed blacks, bright highlights
  | 'pastel-dream'      // soft, desaturated pastels
  | 'neon-night'        // deep blacks, saturated neons
  | 'bleach-bypass'     // desaturated with high contrast
  | 'none';             // no grade
```

Each maps to specific canvas color manipulation (pixel-level or CSS filter chain).

#### Custom Preset Saving
Users can save their mix as a custom preset:
```typescript
interface CustomPreset {
  id: string;
  name: string;
  basedOn: string;       // base template id
  mixer: TemplateMixerState;
  createdAt: string;
}
```

Stored in IndexedDB alongside projects and songs.

---

## 6. HEIC Bug Fix

### Problem
When uploading a mix of HEIC images and videos, only videos appear in the media grid. HEIC images silently fail to convert and get skipped.

### Root Cause Analysis
The latest commit (`fcb4b60`) tried to fix this with a two-tier approach:
1. Try native browser decode (works on Safari/macOS) — creates an `<img>` from the HEIC blob URL
2. Fall back to heic2any library conversion

**Why it still fails:**

1. **Native decode fails on Chrome/Firefox** — These browsers cannot render HEIC natively. The `img.onload` never fires, `img.onerror` fires, `tryNativeDecode()` returns `null`. This part works correctly.

2. **heic2any fails silently** — The `heic2any` library has known issues:
   - It can throw on certain HEIC variants (especially iPhone 15+ ProRes HEIC)
   - The error isn't caught gracefully — the `catch` block in MediaStep now does `continue`, which skips the file entirely
   - Previously it would fall back to showing the original blob URL (which also wouldn't render on Chrome), but at least showed something

3. **File type detection may miss HEIC** — On some systems, HEIC files have `type: ""` (empty string) or `type: "application/octet-stream"` instead of `image/heic`. The `isHeicFile()` function checks both name and type, but `isImageFile()` relies on `file.type.startsWith('image/')` which would return `false` for empty type strings. The HEIC check catches `.heic`/`.heif` extensions though, so this should be OK for named files.

4. **The real issue**: `heic2any` is a large WASM-based library that may fail to initialize or may time out on large batch conversions. There's no timeout handling, and errors bubble up to the `catch` which now skips the file.

### Fix Plan

**A. Add proper error handling and debugging:**
- Add console logging to track exactly where HEIC conversion fails
- Add a timeout wrapper around heic2any (30 second per-file timeout)
- On failure, show a visible error state per-file (red border + error icon) instead of silently skipping

**B. Add a retry mechanism:**
- If heic2any fails, retry once with a fresh import
- Store failed files separately and show a "Retry Failed" button

**C. Consider alternative HEIC decoder:**
- `libheif-js` is a more robust WASM-based HEIC decoder
- Can be used as a second fallback after heic2any fails
- Or replace heic2any entirely

**D. Batch processing improvements:**
- Process HEIC files one at a time (not concurrent) to avoid memory pressure
- Show per-file progress: "Converting image 3/15: sunset.heic..."
- If a file fails, continue with others and show summary at end

**E. File type detection hardening:**
- Read first 12 bytes of file to check for HEIC magic bytes (`ftyp` box: `heic`, `heix`, `hevc`, `mif1`)
- This catches HEIC files regardless of extension or MIME type

### Implementation
```typescript
// Magic byte detection for HEIC
async function isHeicByMagicBytes(file: File): Promise<boolean> {
  const buffer = await file.slice(0, 12).arrayBuffer();
  const view = new DataView(buffer);
  // HEIC files have 'ftyp' at offset 4
  if (view.getUint32(4) === 0x66747970) { // 'ftyp'
    const brand = String.fromCharCode(
      view.getUint8(8), view.getUint8(9), view.getUint8(10), view.getUint8(11)
    );
    return ['heic', 'heix', 'hevc', 'mif1', 'msf1'].includes(brand);
  }
  return false;
}
```

---

## 7. Video Segment Selector

### Problem
Beau: "It's not good at grabbing the best segments out of the video. We need a dragger in the interface on videos so we can move the start point... drag it to the section we wanna show."

Currently, videos just grab a thumbnail at 1 second and use the full duration. No way to select which part of the video to use.

### Solution: Smart Segment Detection + Draggable Trimmer

#### A. Smart Segment Suggestion

When a video is uploaded, analyze it to find the "best" segments:

**Approach: Thumbnail Strip + Scene Change Detection**
1. Extract thumbnails at regular intervals (every 1-2 seconds)
2. Compare consecutive thumbnails for visual difference (pixel delta)
3. High-delta frames = scene changes / interesting moments
4. Suggest the segment with the most visual interest (or faces if detected)

```typescript
interface VideoSegment {
  startTime: number;     // seconds
  endTime: number;       // seconds
  score: number;         // 0-1 interest score
  thumbnailUrl: string;  // thumbnail at midpoint
  reason: 'scene-change' | 'face-detected' | 'motion-peak' | 'manual';
}

interface VideoAnalysis {
  duration: number;
  segments: VideoSegment[];
  thumbnailStrip: { time: number; url: string }[];
  suggestedStart: number;
  suggestedEnd: number;
}
```

**Analysis Pipeline:**
1. Load video into `<video>` element
2. Seek to every 1s mark, capture canvas thumbnail
3. Compare consecutive frames using mean pixel difference
4. Run face detection on thumbnails with high visual content
5. Score each 3-5 second window
6. Return top 3 suggested segments + full thumbnail strip

#### B. Draggable Trimmer UI

Shows below each video in the media grid (expanded on click):

```
┌──────────────────────────────────────────────────┐
│  🎬 sunset-walk.mov  (0:45 total)                │
├──────────────────────────────────────────────────┤
│                                                  │
│  ┌──┬──┬──┬──┬──┬──┬──┬──┬──┬──┬──┬──┬──┬──┬──┐ │
│  │  │  │  │▓▓│▓▓│▓▓│▓▓│▓▓│  │  │  │  │  │  │  │ │  ← Thumbnail strip
│  └──┴──┴──┴──┴──┴──┴──┴──┴──┴──┴──┴──┴──┴──┴──┘ │
│           ◄─────[=========]─────►                │  ← Draggable range
│           |  0:09 - 0:24  |                      │
│                                                  │
│  Preview: [▶ Play Segment]    💡 "Best moment"   │
│  Suggested: [0:09 - 0:14] [0:22 - 0:27] [0:38-] │  ← Quick-pick chips
│                                                  │
└──────────────────────────────────────────────────┘
```

**UI Elements:**
1. *Thumbnail Strip* — filmstrip of frames across the full duration
2. *Range Slider* — draggable start/end handles on the strip
3. *Selected Region* — highlighted area between handles
4. *Play Preview* — button to play just the selected segment
5. *Suggested Segments* — clickable chips for AI-suggested segments
6. *Time Display* — start time, end time, selected duration

**Interaction:**
- Drag left handle = change start point
- Drag right handle = change end point
- Drag middle of selection = move window without changing duration
- Click a suggested segment chip = snap to that range
- Double-click thumbnail = set start point there
- Scroll/pinch on strip = zoom in for fine-tuning

#### C. Data Flow
- `MediaFile.trimStart` and `trimEnd` already exist in the types
- Trimmer UI updates these values
- RenderStep uses trim values when rendering video slots
- Template slots that specify a `duration` will auto-constrain the trim window

#### D. Implementation: VideoTrimmer Component (`src/components/VideoTrimmer.tsx`)

```typescript
interface VideoTrimmerProps {
  media: MediaFile;
  onTrimChange: (trimStart: number, trimEnd: number) => void;
}

// Uses:
// - <video> element for playback preview
// - Canvas for thumbnail strip extraction
// - Touch/mouse drag for range handles
// - framer-motion for smooth handle animation
```

#### E. Video Thumbnail Strip Service (`src/lib/video-analyzer.ts`)

```typescript
class VideoAnalyzer {
  static async analyze(videoUrl: string, options?: {
    thumbnailInterval?: number;  // seconds between thumbs (default: 1)
    segmentDuration?: number;    // ideal segment length (default: 5s)
  }): Promise<VideoAnalysis>

  static async extractThumbnailStrip(
    videoUrl: string,
    count: number,
  ): Promise<{ time: number; url: string; blob: Blob }[]>

  static async findBestSegment(
    videoUrl: string,
    targetDuration: number,
  ): Promise<VideoSegment>

  static async compareFrames(
    frame1: ImageData,
    frame2: ImageData,
  ): number  // 0-1 similarity score
}
```

---

## 8. Face Detection Upgrade

### Problem
Current face detection is a custom skin-tone pixel analysis (YCbCr color space). It's inaccurate — misses faces, detects non-faces, and only works on photos.

### Current Implementation Issues
1. **YCbCr skin-tone detection** — Only works for certain skin tones, fails on:
   - Very dark or very light skin
   - Unusual lighting (blue/red tinted photos)
   - Wearing masks or heavy makeup
   - Small faces in group shots
2. **No video face detection** — Videos get `faces: []` always
3. **Processing at 400px scale** — Too aggressive downscaling loses small faces
4. **Connected region analysis with stride 3** — Skips pixels, misses small regions
5. **Aspect ratio filter (0.5-2.0)** — Too loose, catches hands, arms, etc.

### Solution: MediaPipe Face Detection (Already a Dependency)

`@mediapipe/face_detection` is already in `package.json` but NOT being used. The current code uses a custom skin-tone approach instead.

**Upgrade to use the actual MediaPipe library:**

```typescript
import { FaceDetection, Results } from '@mediapipe/face_detection';

async function detectFacesMediaPipe(imageUrl: string): Promise<FaceRegion[]> {
  const faceDetection = new FaceDetection({
    locateFile: (file) =>
      `https://cdn.jsdelivr.net/npm/@mediapipe/face_detection/${file}`,
  });

  faceDetection.setOptions({
    model: 'short',         // 'short' for faces within 2m, 'full' for all distances
    minDetectionConfidence: 0.5,
  });

  // Process image
  const img = await loadImage(imageUrl);
  const results = await new Promise<Results>((resolve) => {
    faceDetection.onResults(resolve);
    faceDetection.send({ image: img });
  });

  return results.detections.map(det => ({
    x: det.boundingBox.xCenter - det.boundingBox.width / 2,
    y: det.boundingBox.yCenter - det.boundingBox.height / 2,
    width: det.boundingBox.width,
    height: det.boundingBox.height,
    confidence: det.score,
    // Bonus: landmarks (eyes, nose, mouth)
    landmarks: det.landmarks,
  }));
}
```

**Benefits over current approach:**
- Works on ALL skin tones
- Sub-millisecond detection per image
- Returns face landmarks (eyes, nose, mouth positions)
- Works at any scale without manual downscaling
- Actually identifies faces, not just skin-colored blobs

**If MediaPipe fails to load** (CDN issue, offline):
- Fall back to the existing skin-tone detection
- Log warning so we know it's degraded

### Video Face Detection (NEW)
For videos, run face detection on the thumbnail strip frames:
1. During video analysis (Section 7), extract thumbnails
2. Run MediaPipe face detection on each thumbnail
3. Segments with faces get a higher "interest score"
4. Store face data per-segment for smart crop during rendering

### Face Detection Service Updates (`src/lib/face-detect.ts`)
```typescript
// New exports
export async function detectFaces(imageUrl: string): Promise<FaceRegion[]>
  // MediaPipe primary, skin-tone fallback

export async function detectFacesInVideo(
  videoUrl: string,
  timestamps: number[],
): Promise<Map<number, FaceRegion[]>>
  // Run detection at each timestamp

export function getBestFaceFrame(
  faceMap: Map<number, FaceRegion[]>,
): { timestamp: number; faces: FaceRegion[] }
  // Find the frame with the most/best faces
```

---

## 9. Updated Data Model

### Types Overview (`src/types/index.ts`)

```typescript
// ===== Motion Effects =====
export type MotionEffect =
  // Camera movements
  | 'dolly-in' | 'dolly-out' | 'orbit' | 'crane-up' | 'crane-down'
  | 'whip-pan' | 'rack-focus'
  // Dynamic
  | 'speed-ramp' | 'pulse-zoom' | 'drift' | 'tilt-shift' | 'split-screen'
  // Film
  | 'film-grain' | 'chromatic-aberration' | 'bloom' | 'lens-flare' | 'light-leak'
  // Clone/echo
  | 'echo-trail' | 'mirror' | 'pixelate-reveal'
  // Legacy (kept for backwards compat)
  | 'ken-burns' | 'parallax' | 'static' | 'slow-zoom'
  | 'pan-left' | 'pan-right' | 'bounce';

// ===== Transition Effects =====
export type TransitionEffect =
  // Warp
  | 'morph-dissolve' | 'radial-wipe' | 'clock-wipe' | 'iris-wipe' | 'curtain'
  // 3D-style
  | 'page-curl' | 'cube-rotate' | 'flip-card' | 'shatter' | 'swirl'
  // Energy
  | 'whip-blur' | 'flash-white' | 'flash-black' | 'rgb-split-wipe'
  | 'glitch-blocks' | 'pixelate-crossfade'
  // Legacy
  | 'fade' | 'slide-left' | 'slide-right' | 'zoom-in' | 'zoom-out'
  | 'glitch' | 'none';

// ===== Post-Processing =====
export type PostEffect =
  | 'color-grade' | 'motion-blur' | 'film-grain' | 'chromatic-aberration'
  | 'bloom' | 'vignette-pulse' | 'letterbox' | 'scanlines'
  | 'light-leak' | 'lens-flare';

// ===== Text Animations (expanded) =====
export type TextAnimation =
  | 'fade-in' | 'slide-up' | 'slide-down' | 'slide-left' | 'slide-right'
  | 'typewriter' | 'scale-pop' | 'glitch-in'
  | 'letter-by-letter' | 'word-by-word' | 'bounce-in' | 'elastic-pop'
  | 'spin-in' | 'wave' | 'shake' | 'flicker' | 'electric-zap'
  | 'shatter-in' | 'blur-reveal' | '3d-flip' | 'matrix-rain'
  | 'stroke-draw' | 'split-reveal' | 'none';

// ===== Easing =====
export type EasingType =
  | 'linear' | 'ease-in' | 'ease-out' | 'ease-in-out'
  | 'spring' | 'bounce-back' | 'snap';

// ===== Post Effect Config =====
export interface PostEffectConfig {
  effect: PostEffect;
  intensity: number;        // 0-1
  params?: Record<string, number | string>;
}

// ===== Color Grade =====
export type ColorGradePreset =
  | 'warm-cinematic' | 'cool-teal' | 'vintage-fade' | 'high-contrast'
  | 'pastel-dream' | 'neon-night' | 'bleach-bypass' | 'none';

// ===== Template Slot v2 =====
export interface TemplateSlotV2 {
  slotType: 'photo' | 'video' | 'any';
  duration: number;
  transition: TransitionEffect;
  effect: MotionEffect;
  holdPoint: 'face' | 'center' | 'rule-of-thirds';
  textOverlay?: TextOverlay;

  // v4 additions
  motionEasing?: EasingType;
  motionIntensity?: number;         // 0-1
  transitionDuration?: number;      // seconds (overrides default 0.4s)
  transitionEasing?: EasingType;
  postEffects?: PostEffectConfig[];
  speedCurve?: number[];            // keyframe speed multipliers
}
```

---

## 10. New File Structure

```
src/
├── app/
│   ├── page.tsx                        # Main editor (updated flow)
│   ├── projects/
│   │   └── page.tsx                    # Project manager page
│   ├── layout.tsx                      # (add font imports)
│   ├── globals.css                     # (expanded animations)
│   └── api/
│       ├── youtube-audio/route.ts      # (existing)
│       └── render/route.ts             # (existing)
├── components/
│   ├── Header.tsx                      # (add Projects nav)
│   ├── MediaStep.tsx                   # (minor: auto-save integration)
│   ├── TemplateStep.tsx                # (add Mixer panel)
│   ├── MusicStep.tsx                   # (add Song Library section)
│   ├── RenderStep.tsx                  # (new effects engine)
│   ├── ProjectGrid.tsx                 # NEW: project manager grid
│   ├── ProjectCard.tsx                 # NEW: project thumbnail card
│   ├── SongLibrary.tsx                 # NEW: song library browser
│   ├── TemplateMixer.tsx               # NEW: mixer panel
│   ├── TextStylePicker.tsx             # NEW: text style preview/picker
│   └── VideoTrimmer.tsx                # NEW: draggable video segment selector
├── lib/
│   ├── effects-engine.ts              # NEW: multi-pass render pipeline
│   ├── effects/
│   │   ├── motions.ts                 # NEW: all 20+ motion implementations
│   │   ├── transitions.ts            # NEW: all 15+ transition implementations
│   │   ├── post-processing.ts        # NEW: post-processing stack
│   │   ├── easing.ts                 # NEW: easing curve library
│   │   └── speed-ramp.ts             # NEW: speed ramping system
│   ├── text-renderer.ts              # REWRITE: styled text + new animations
│   ├── text-styles.ts                # NEW: text style presets
│   ├── color-grades.ts               # NEW: color grade implementations
│   ├── particles.ts                   # (existing, minor updates)
│   ├── templates.ts                   # (updated with v2 slot data)
│   ├── song-library.ts               # NEW: IndexedDB song storage
│   ├── project-manager.ts            # NEW: IndexedDB project storage
│   ├── db.ts                          # NEW: IndexedDB wrapper/init
│   ├── fonts.ts                       # NEW: font loading/management
│   ├── video-analyzer.ts              # NEW: video thumbnail strip + scene detection
│   ├── face-detect.ts                 # REWRITE: MediaPipe + video face detection
│   └── heic-convert.ts               # FIX: magic byte detection, retry, timeout
└── types/
    ├── index.ts                       # (expanded with all new types)
    └── heic2any.d.ts                  # (existing)
```

---

## 11. Build Phases

### Phase 0: Critical Fixes (Day 0 — FIRST)
- [ ] Fix HEIC conversion: add magic byte detection, timeout wrapper, retry mechanism
- [ ] Add per-file error states (red border + error icon instead of silent skip)
- [ ] Upgrade face detection to use MediaPipe (already in package.json)
- [ ] Add skin-tone fallback if MediaPipe CDN fails
- [ ] Create VideoTrimmer component with draggable range handles
- [ ] Create video-analyzer.ts (thumbnail strip extraction, scene change detection)
- [ ] Smart segment suggestion (score segments by visual interest + faces)
- [ ] Wire trimmer into MediaStep (expand on video click)
- [ ] Wire trimStart/trimEnd into RenderStep (use trim values during rendering)
- **Checkpoint:** HEIC files convert reliably, videos have trimmer, faces detected accurately

### Phase 1: Storage Foundation (Day 1)
- [ ] `src/lib/db.ts` — IndexedDB initialization with stores: songs, projects, presets
- [ ] `src/lib/song-library.ts` — CRUD operations for songs
- [ ] `src/lib/project-manager.ts` — CRUD operations for projects
- [ ] Update `MusicStep.tsx` — add "Save to Library" button after ripping/uploading
- [ ] Create `SongLibrary.tsx` — browseable song library UI in Music step
- **Checkpoint:** Songs persist across sessions, can browse/search/delete

### Phase 2: Project Manager (Day 1-2)
- [ ] `src/components/ProjectGrid.tsx` — project listing with thumbnails
- [ ] `src/components/ProjectCard.tsx` — individual project card
- [ ] `src/app/projects/page.tsx` — project manager route
- [ ] Update `Header.tsx` — add Projects navigation
- [ ] Auto-save logic in main `page.tsx` — save project state on step changes
- [ ] Load project flow — click project → restore all state
- [ ] Duplicate, delete, change-template actions
- **Checkpoint:** Can save/load/manage projects, data persists

### Phase 3: Effects Engine Core (Day 2-3)
- [ ] `src/lib/effects/easing.ts` — 7+ easing curves
- [ ] `src/lib/effects/speed-ramp.ts` — speed curve system
- [ ] `src/lib/effects-engine.ts` — multi-pass pipeline with offscreen canvases
- [ ] `src/lib/effects/motions.ts` — 20+ motion effect implementations
- [ ] `src/lib/effects/transitions.ts` — 15+ transition implementations
- [ ] `src/lib/effects/post-processing.ts` — post-processing stack
- [ ] Refactor `RenderStep.tsx` — use new effects engine
- **Checkpoint:** Rendering uses new pipeline, basic effects working

### Phase 4: Advanced Effects (Day 3-4)
- [ ] Implement all motion effects (dolly, orbit, crane, whip-pan, speed-ramp, etc.)
- [ ] Implement all transitions (morph-dissolve, iris-wipe, cube-rotate, shatter, etc.)
- [ ] Implement post-processing (bloom, chromatic aberration, motion blur, film grain, etc.)
- [ ] `src/lib/color-grades.ts` — color grade presets
- **Checkpoint:** All effects render correctly, performance acceptable

### Phase 5: Text Design System (Day 4-5)
- [ ] `src/lib/fonts.ts` — Google Fonts loading
- [ ] `src/lib/text-styles.ts` — 14+ text style presets
- [ ] Rewrite `src/lib/text-renderer.ts` — styled rendering + 20+ animations
- [ ] `src/components/TextStylePicker.tsx` — preview picker UI
- [ ] Update `TemplateStep.tsx` — text style selection in overlay editor
- **Checkpoint:** All text is beautifully styled with modern fonts and animations

### Phase 6: Template Mixer (Day 5-6)
- [ ] `src/components/TemplateMixer.tsx` — layer swapping UI
- [ ] Mixer state management in `page.tsx`
- [ ] Wire mixer overrides into effects engine
- [ ] Custom preset saving/loading
- [ ] Update all 12 templates with v2 data (new effects, transitions, post-processing)
- **Checkpoint:** Can mix any effect with any template

### Phase 7: Template Redesign (Day 6)
- [ ] Rewrite all 12 templates using the new effects vocabulary
- [ ] Each template becomes a curated effects pipeline
- [ ] Test every template for visual impact
- [ ] Tune timing, intensities, transitions

### Phase 8: Polish & Verify (Day 7)
- [ ] Mobile responsive (mixer, library, projects)
- [ ] Performance optimization (target: 30fps on mid-range devices)
- [ ] Run `tsc --noEmit` + `npm run build`
- [ ] Runtime test all templates, all effects, all transitions
- [ ] Run iterate skill (3 cycles)
- [ ] Run preflight-app skill
- **Checkpoint:** Ship it

---

## 12. Storage Architecture

### Why IndexedDB (not Server/Database)

1. **Zero infrastructure** — no database server, no auth, no API
2. **Works offline** — projects persist even without internet
3. **Large binary storage** — IndexedDB handles multi-GB of images/videos
4. **Per-browser** — each user's browser has their own library
5. **Fast** — no network latency for project loads

### Database Schema

```
IndexedDB: "photoforge-db"
├── Store: "songs"
│   ├── Key: id (string)
│   ├── Indexes: name, dateAdded, source, tags
│   └── Value: LibrarySong (includes audioBlob)
├── Store: "projects"
│   ├── Key: id (string)
│   ├── Indexes: name, createdAt, updatedAt, templateId
│   └── Value: SavedProject (includes media blobs)
├── Store: "presets"
│   ├── Key: id (string)
│   ├── Indexes: name, basedOn
│   └── Value: CustomPreset
└── Store: "settings"
    ├── Key: key (string)
    └── Value: any (auto-save toggle, default quality, etc.)
```

### Storage Limits
- Most browsers allow 50-80% of free disk space
- We show a storage usage indicator
- Old exports can be purged to free space
- Media blobs are the biggest cost — optional to store

---

## Key Decisions

1. **All client-side storage (IndexedDB)** — no server database needed
2. **Canvas 2D only** — no WebGL dependency, works on all browsers
3. **Backwards compatible** — old templates still work, new features are additive
4. **Modular architecture** — effects, transitions, text styles are all pluggable
5. **Template Mixer creates millions of combos** from 12 base templates
6. **Song Library persists across sessions** — rip once, use forever
7. **Projects are fully restorable** — media, settings, everything saved
8. **Text is never plain** — always styled with fonts, effects, animations
9. **Google Fonts loaded client-side** — no custom font hosting needed
10. **No new npm dependencies** for storage — raw IndexedDB API
11. **HEIC uses magic byte detection** — doesn't rely on MIME type alone
12. **MediaPipe for face detection** — already a dependency, just not wired up
13. **Video segments are interactive** — draggable trimmer with AI suggestions
14. **Phase 0 runs FIRST** — fix HEIC + face detection + add trimmer before new features

---

## Port
- Dev: `5190` (existing)
- No new ports needed (everything is client-side)

## Version
- Current: PhotoForge v3.0
- Target: PhotoForge v4.0
