export interface MediaFile {
  id: string;
  file: File;
  url: string;
  name: string;
  width: number;
  height: number;
  selected: boolean;
  faces: FaceRegion[];
  order: number;
  type: 'photo' | 'video';
  duration?: number;
  trimStart?: number;
  trimEnd?: number;
  thumbnailUrl?: string;
}

export type PhotoFile = MediaFile;

export interface FaceRegion {
  x: number;
  y: number;
  width: number;
  height: number;
  confidence: number;
}

export interface MusicTrack {
  id: string;
  name: string;
  file?: File;
  url: string;
  duration: number;
  source: 'upload' | 'youtube';
}

export interface TemplateSlot {
  slotType: 'photo' | 'video' | 'any';
  duration: number;
  /** Transition name — any key from TRANSITION_MAP */
  transition: string;
  /** Motion effect name — any key from MOTION_MAP */
  effect: string;
  holdPoint: 'face' | 'center' | 'rule-of-thirds';
  /** Motion intensity override (0-1) */
  motionIntensity?: number;
  /** Motion easing override */
  motionEasing?: string;
  /** Transition easing override */
  transitionEasing?: string;
  /** Transition duration in seconds (default 0.4) */
  transitionDuration?: number;
  /** Post-processing effects for this slot */
  postEffects?: { effect: string; intensity: number; params?: Record<string, number | string> }[];
  /** Speed curve preset name */
  speedPreset?: string;
  /** Optional text overlay shown during this slot */
  textOverlay?: TextOverlay;
}

/** Text overlay that can appear on a slot or as intro/outro */
export interface TextOverlay {
  text: string;
  position: 'top' | 'center' | 'bottom';
  fontSize: 'sm' | 'md' | 'lg' | 'xl';
  fontWeight: 'normal' | 'bold' | 'black';
  animation: 'fade-in' | 'slide-up' | 'typewriter' | 'scale-pop' | 'glitch-in' | 'none';
  color: string;
  /** Optional shadow/glow color */
  glowColor?: string;
}

/** Particle/effect system for template themes */
export type ParticleType = 'confetti' | 'snow' | 'sparks' | 'hearts' | 'stars' | 'bubbles' | 'none';

export interface TemplateTheme {
  /** CSS filter applied to media (e.g., warm tint, cool tint) */
  mediaFilter?: string;
  /** Background color behind media */
  bgColor: string;
  /** Particle effect during playback */
  particles: ParticleType;
  /** Particle density (0-1) */
  particleDensity: number;
  /** Color tint overlay (rgba) */
  tintOverlay?: string;
  /** Vignette intensity (0-1, 0 = none) */
  vignette: number;
}

export type TemplateStyle =
  | 'cinematic' | 'dynamic' | 'minimal' | 'retro' | 'glitch' | 'parallax'
  | 'summer' | 'winter' | 'party' | 'electric' | 'golden' | 'neon';

export interface SmartTemplate {
  id: string;
  name: string;
  description: string;
  style: TemplateStyle;
  color: string;
  totalDuration: number;
  slots: TemplateSlot[];
  mediaCount: number;
  /** Theme-specific visual effects */
  theme: TemplateTheme;
  /** Default text overlays (user can edit/remove) */
  defaultTexts: TextOverlay[];
  /** Emoji/icon for template picker */
  emoji: string;
  /** Default color grade preset ID */
  colorGrade?: string;
  /** Default speed preset for all slots */
  defaultSpeed?: string;
}

export interface Template {
  id: string;
  name: string;
  description: string;
  thumbnail: string;
  style: TemplateStyle;
  transitionType: string;
  durationPerPhoto: number;
  color: string;
}

export interface RenderProgress {
  status: 'idle' | 'preparing' | 'rendering' | 'encoding' | 'complete' | 'error';
  percent: number;
  currentFrame: number;
  totalFrames: number;
  message: string;
  outputUrl?: string;
  error?: string;
}

export type Step = 'media' | 'template' | 'music' | 'render';
