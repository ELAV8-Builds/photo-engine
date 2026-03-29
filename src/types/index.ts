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
  transition: 'fade' | 'slide-left' | 'slide-right' | 'zoom-in' | 'zoom-out' | 'glitch' | 'none';
  effect: 'ken-burns' | 'parallax' | 'static' | 'slow-zoom' | 'pan-left' | 'pan-right' | 'bounce';
  holdPoint: 'face' | 'center' | 'rule-of-thirds';
}

export interface SmartTemplate {
  id: string;
  name: string;
  description: string;
  style: 'cinematic' | 'dynamic' | 'minimal' | 'retro' | 'glitch' | 'parallax';
  color: string;
  totalDuration: number;
  slots: TemplateSlot[];
  mediaCount: number;
}

export interface Template {
  id: string;
  name: string;
  description: string;
  thumbnail: string;
  style: 'cinematic' | 'dynamic' | 'minimal' | 'retro' | 'glitch' | 'parallax';
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
