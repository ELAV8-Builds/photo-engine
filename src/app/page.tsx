'use client';

import { useState, useCallback, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Header from '@/components/Header';
import MediaStep from '@/components/MediaStep';
import TemplateStep from '@/components/TemplateStep';
import MusicStep from '@/components/MusicStep';
import RenderStep from '@/components/RenderStep';
import { MediaFile, MusicTrack, Step } from '@/types';
import { loadProject, saveProject, updateProject } from '@/lib/project-manager';
import { SMART_TEMPLATES, expandTemplateForMedia } from '@/lib/templates';
import type { MixerOverrides } from '@/components/TemplateMixer';

function HomeContent() {
  const searchParams = useSearchParams();
  const projectIdParam = searchParams.get('project');

  const [step, setStep] = useState<Step>('media');
  const [media, setMedia] = useState<MediaFile[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null);
  const [music, setMusic] = useState<MusicTrack | null>(null);
  const [musicTracks, setMusicTracks] = useState<MusicTrack[]>([]);
  const [title, setTitle] = useState('');
  const [aspectRatio, setAspectRatio] = useState<'16:9' | '9:16' | '1:1'>('16:9');
  const [outputQuality, setOutputQuality] = useState<'720p' | '1080p' | '4k'>('1080p');
  const [textOverrides, setTextOverrides] = useState<Record<number, string | null>>({});
  const [mixerOverrides, setMixerOverrides] = useState<MixerOverrides>({});

  // Project state
  const [currentProjectId, setCurrentProjectId] = useState<string | null>(null);
  const [projectName, setProjectName] = useState<string>('');
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');

  const selectedCount = media.filter(p => p.selected).length;

  // Load project from URL query param
  useEffect(() => {
    if (!projectIdParam) return;

    const load = async () => {
      try {
        const data = await loadProject(projectIdParam);
        if (!data) {
          console.warn('[Home] Project not found:', projectIdParam);
          return;
        }

        setMedia(data.media);
        setSelectedTemplate(data.templateId);
        setMusic(data.music);
        // Restore musicTracks from saved music (so playlist shows the track)
        setMusicTracks(data.music ? [data.music] : []);
        setTitle(data.title);
        setAspectRatio(data.aspectRatio);
        setOutputQuality(data.outputQuality);
        setTextOverrides(data.textOverrides);
        setCurrentProjectId(projectIdParam);

        // If project has media and template, jump to an appropriate step
        if (data.media.length > 0 && data.templateId) {
          setStep('template');
        }
        console.log('[Home] Loaded project:', projectIdParam);
      } catch (err) {
        console.error('[Home] Failed to load project:', err);
      }
    };

    load();
  }, [projectIdParam]);

  const canNavigate = useCallback((target: Step): boolean => {
    const steps: Step[] = ['media', 'template', 'music', 'render'];
    const targetIdx = steps.indexOf(target);
    const currentIdx = steps.indexOf(step);

    if (targetIdx <= currentIdx) return true;
    if (targetIdx >= 1 && selectedCount < 2) return false;
    if (targetIdx >= 2 && !selectedTemplate) return false;
    return true;
  }, [step, selectedCount, selectedTemplate]);

  // Save project handler
  const handleSaveProject = useCallback(async () => {
    if (media.length === 0) return;

    setSaveStatus('saving');
    try {
      const selectedMedia = media.filter((m) => m.selected);
      const baseTemplate = selectedTemplate ? SMART_TEMPLATES.find((t) => t.id === selectedTemplate) : null;
      // Use expanded template duration (accounts for 60+ photos and song-length fitting)
      const targetDuration = music?.duration && music.duration > 0 ? music.duration : undefined;
      const template = baseTemplate ? expandTemplateForMedia(baseTemplate, selectedMedia.length, targetDuration) : null;
      const totalDuration = template
        ? template.totalDuration
        : selectedMedia.length * 3.5;

      const name = projectName || title || `Project ${new Date().toLocaleDateString()}`;

      if (currentProjectId) {
        // Update existing project
        await updateProject(currentProjectId, {
          name,
          media,
          templateId: selectedTemplate,
          music,
          title,
          aspectRatio,
          outputQuality,
          textOverrides,
          totalDuration,
        });
      } else {
        // Create new project
        const id = await saveProject({
          name,
          media,
          templateId: selectedTemplate,
          music,
          title,
          aspectRatio,
          outputQuality,
          textOverrides,
          totalDuration,
        });
        setCurrentProjectId(id);
        setProjectName(name);
      }

      setSaveStatus('saved');
      setTimeout(() => setSaveStatus('idle'), 3000);
    } catch (err) {
      console.error('[Home] Save failed:', err);
      setSaveStatus('error');
      setTimeout(() => setSaveStatus('idle'), 3000);
    }
  }, [
    media, selectedTemplate, music, title, aspectRatio,
    outputQuality, textOverrides, currentProjectId, projectName,
  ]);

  return (
    <div className="min-h-screen flex flex-col">
      <Header
        currentStep={step}
        onStepClick={setStep}
        canNavigate={canNavigate}
        projectName={projectName || undefined}
      />

      <main id="main-content" className="flex-1 max-w-5xl mx-auto w-full px-4 sm:px-6 py-8">
        {step === 'media' && (
          <MediaStep
            media={media}
            onMediaChange={setMedia}
            onNext={() => setStep('template')}
          />
        )}

        {step === 'template' && (
          <TemplateStep
            selectedTemplate={selectedTemplate}
            onSelectTemplate={(id) => { setSelectedTemplate(id); setTextOverrides({}); setMixerOverrides({}); }}
            media={media}
            aspectRatio={aspectRatio}
            onAspectChange={setAspectRatio}
            textOverrides={textOverrides}
            onTextOverridesChange={setTextOverrides}
            mixerOverrides={mixerOverrides}
            onMixerOverridesChange={setMixerOverrides}
            onNext={() => setStep('music')}
            onBack={() => setStep('media')}
          />
        )}

        {step === 'music' && (
          <MusicStep
            music={music}
            onMusicChange={setMusic}
            musicTracks={musicTracks}
            onMusicTracksChange={setMusicTracks}
            photos={media}
            selectedTemplate={selectedTemplate}
            onNext={() => setStep('render')}
            onBack={() => setStep('template')}
          />
        )}

        {step === 'render' && (
          <RenderStep
            photos={media}
            selectedTemplate={selectedTemplate}
            music={music}
            title={title}
            onTitleChange={setTitle}
            aspectRatio={aspectRatio}
            outputQuality={outputQuality}
            onQualityChange={setOutputQuality}
            textOverrides={textOverrides}
            mixerOverrides={mixerOverrides}
            onBack={() => setStep('music')}
            onExportComplete={handleSaveProject}
            musicTracks={musicTracks}
          />
        )}
      </main>

      <footer className="border-t border-border-subtle py-4">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 flex items-center justify-between text-xs text-text-muted">
          <span className="font-mono">PHOTOFORGE v4.0</span>
          <div className="flex items-center gap-4">
            {/* Save button — visible when there's media */}
            {media.length > 0 && (
              <button
                onClick={handleSaveProject}
                disabled={saveStatus === 'saving'}
                className={`flex items-center gap-1.5 px-3 py-1 rounded-md transition-colors ${
                  saveStatus === 'saved'
                    ? 'text-green-400 bg-green-500/10'
                    : saveStatus === 'error'
                    ? 'text-red-400 bg-red-500/10'
                    : saveStatus === 'saving'
                    ? 'text-accent-gold/50'
                    : 'text-text-muted hover:text-white hover:bg-white/5'
                }`}
              >
                {saveStatus === 'saving' ? (
                  <div className="w-3 h-3 border-2 border-accent-gold border-t-transparent rounded-full animate-spin" />
                ) : saveStatus === 'saved' ? (
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                ) : (
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z" />
                    <polyline points="17 21 17 13 7 13 7 21" />
                    <polyline points="7 3 7 8 15 8" />
                  </svg>
                )}
                {saveStatus === 'saved' ? 'Saved' : saveStatus === 'error' ? 'Save Failed' : saveStatus === 'saving' ? 'Saving...' : 'Save Project'}
              </button>
            )}
            <span>Built by ELAV8</span>
          </div>
        </div>
      </footer>
    </div>
  );
}

export default function Home() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-accent-gold border-t-transparent rounded-full animate-spin" />
      </div>
    }>
      <HomeContent />
    </Suspense>
  );
}
