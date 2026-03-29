export interface PhotoFile {
  id: string;
  file: File;
  url: string;
  name: string;
  width: number;
  height: number;
  selected: boolean;
  faces: FaceRegion[];
  order: number;
}

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

export interface ProjectState {
  photos: PhotoFile[];
  selectedTemplate: string | null;
  music: MusicTrack | null;
  title: string;
  durationPerPhoto: number;
  transitionDuration: number;
  outputQuality: '720p' | '1080p' | '4k';
  aspectRatio: '16:9' | '9:16' | '1:1';
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

export type Step = 'photos' | 'template' | 'music' | 'render';
