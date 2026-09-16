'use client';

import { useState, useCallback, useEffect, useMemo, Suspense, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import Header from '@/components/Header';
import MediaStep from '@/components/MediaStep';
import TemplateStep from '@/components/TemplateStep';
import MusicStep from '@/components/MusicStep';
import RenderStep from '@/components/RenderStep';
import { MediaFile, MusicTrack, Step, TextOverlayOverride } from '@/types';
import type { StoryPlan } from '@/types/library';
import { loadProject, saveProject, updateProject } from '@/lib/project-manager';
import { SMART_TEMPLATES, expandTemplateForMedia } from '@/lib/templates';
import { libraryApi, LibraryApiError } from '@/lib/library-client';
import { buildStoryTextOverrides, orderMediaByStory, rolesForMedia, storyKeysForMedia, templateIdForStyle } from '@/lib/story-apply';
import { loadProviderSettings } from '@/lib/provider-settings';
import type { MixerOverrides } from '@/components/TemplateMixer';

function HomeContent() {
  const searchParams = useSearchParams();
  const projectIdParam = searchParams.get('project');

  const mediaStepRef = useRef<{ triggerUpload: () => void } | null>(null);

  const [step, setStep] = useState<Step>('media');
  const [media, setMedia] = useState<MediaFile[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null);
  const [music, setMusic] = useState<MusicTrack | null>(null);
  const [musicTracks, setMusicTracks] = useState<MusicTrack[]>([]);
  const [title, setTitle] = useState('');
  const [aspectRatio, setAspectRatio] = useState<'16:9' | '9:16' | '1:1'>('16:9');
  const [outputQuality, setOutputQuality] = useState<'720p' | '1080p' | '4k'>('1080p');
  const [textOverrides, setTextOverrides] = useState<Record<number, TextOverlayOverride>>({});
  const [mixerOverrides, setMixerOverrides] = useState<MixerOverrides>({});

  // Project state
  const [currentProjectId, setCurrentProjectId] = useState<string | null>(null);
  const [projectName, setProjectName] = useState<string>('');
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');

  const selectedCount = media.filter(p => p.selected).length;
  // "Auto-pick best N" follows the chosen template's slot count; 12 makes a solid montage otherwise.
  const suggestedPickCount = (selectedTemplate && SMART_TEMPLATES.find((t) => t.id === selectedTemplate)?.mediaCount) || 12;

  // Story layer (Phase 3): a plan is written for the current library shots and applied on request.
  const [storyPlan, setStoryPlan] = useState<StoryPlan | null>(null);
  const [storyBusy, setStoryBusy] = useState(false);
  const [storyError, setStoryError] = useState<string | null>(null);
  const [storyApplied, setStoryApplied] = useState(false);
  const storyKeys = useMemo(() => storyKeysForMedia(media), [media]);

  const generateStory = useCallback(async (force: boolean) => {
    if (storyKeys.length === 0) return;
    setStoryBusy(true);
    setStoryError(null);
    try {
      await loadProviderSettings(); // so the request carries the chosen provider (and key) headers
      const { plan } = await libraryApi.storyPlan({ keys: storyKeys, force });
      setStoryPlan(plan);
      setStoryApplied(false);
    } catch (err) {
      setStoryError(err instanceof LibraryApiError || err instanceof Error ? err.message : 'Could not write the story');
    } finally {
      setStoryBusy(false);
    }
  }, [storyKeys]);

  /** Select the recommended template, lead with the opener, end on the closer, and put the titles on the slots. */
  const applyStory = useCallback(() => {
    if (!storyPlan) return;
    const templateId = templateIdForStyle(storyPlan.templateStyle) ?? selectedTemplate;
    const base = templateId ? SMART_TEMPLATES.find((t) => t.id === templateId) : null;
    const ordered = orderMediaByStory(media, storyPlan);
    setMedia(ordered);
    if (templateId) setSelectedTemplate(templateId);
    setMixerOverrides({});
    if (base) {
      const roles = rolesForMedia(ordered, storyPlan);
      const expanded = expandTemplateForMedia(base, roles.length, undefined, roles);
      setTextOverrides(buildStoryTextOverrides(expanded, storyPlan, ordered, base));
    }
    setStoryApplied(true);
  }, [storyPlan, media, selectedTemplate]);

  /** Phase 10: the plan's writing on the *current* template — no template switch, no reorder. */
  const applyStoryText = useCallback(() => {
    if (!storyPlan || !selectedTemplate) return;
    const base = SMART_TEMPLATES.find((t) => t.id === selectedTemplate);
    if (!base) return;
    const expanded = expandTemplateForMedia(base, media.filter((m) => m.selected).length);
    setTextOverrides(buildStoryTextOverrides(expanded, storyPlan, media, base));
  }, [storyPlan, selectedTemplate, media]);

  // Applying is a snapshot; editing the shot list afterwards means the story no longer matches.
  useEffect(() => {
    if (storyPlan && storyApplied && storyKeys.join('|') !== storyPlan.keys.join('|')) setStoryApplied(false);
  }, [storyKeys, storyPlan, storyApplied]);

  // Phase 10: the story is the default text layer, not a hidden button — write it
  // as soon as the Template step opens with library-backed shots. Plans are
  // cached per shot list on the server, so this costs one model pass per
  // selection ever (heuristic fallback when the model is down). A failure does
  // not retry on its own; Regenerate does.
  useEffect(() => {
    const planMatches = storyPlan && storyPlan.keys.join('|') === storyKeys.join('|');
    if (step === 'template' && storyKeys.length > 0 && !planMatches && !storyBusy && !storyError) generateStory(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, storyKeys.join('|'), storyPlan, storyBusy, storyError]);

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

      <main id="main-content" className="flex-1 max-w-5xl mx-auto w-full px-4 sm:px-6 py-12">
        {/* Create New Project CTA — shown when no project has started */}
        {step === 'media' && media.length === 0 && (
          <section className="mb-16 animate-in fade-in-0 slide-in-from-bottom-3">
            <div className="card-glow p-12 sm:p-16 text-center relative overflow-hidden">
              {/* Subtle background accent */}
              <div className="absolute inset-0 bg-gradient-to-br from-accent-gold/0 via-accent-gold/5 to-accent-gold/0 pointer-events-none" />
              
              {/* Glowing decorative element */}
              <div className="absolute -top-20 -right-20 w-64 h-64 bg-accent-gold/5 rounded-full blur-3xl pointer-events-none" />
              <div className="absolute -bottom-20 -left-20 w-64 h-64 bg-accent-gold/5 rounded-full blur-3xl pointer-events-none" />
              
              <div className="relative z-10">
                <div className="flex justify-center mb-8">
                  <div className="w-24 h-24 rounded-2xl bg-gradient-to-br from-accent-gold/20 to-accent-gold/5 border-2 border-accent-gold/40 flex items-center justify-center shadow-lg shadow-accent-gold/20 animate-in fade-in-0 zoom-in-100">
                    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" className="text-accent-gold" strokeWidth="1.5">
                      <circle cx="12" cy="12" r="10" />
                      <line x1="12" y1="8" x2="12" y2="16" />
                      <line x1="8" y1="12" x2="16" y2="12" />
                    </svg>
                  </div>
                </div>
                <h1 className="text-4xl sm:text-5xl font-extrabold text-white mb-6 tracking-tight animate-in fade-in-0 slide-in-from-bottom-2">
                  Create New Project
                </h1>
                <p className="text-text-secondary text-lg sm:text-xl max-w-2xl mx-auto mb-10 leading-relaxed animate-in fade-in-0 slide-in-from-bottom-2" style={{ animationDelay: '100ms' }}>
                  Bring your photos and videos to life with cinematic transitions, smart story planning, and professional color grading. Start by uploading your media.
                </p>
                <div className="flex flex-col sm:flex-row items-center justify-center gap-4 animate-in fade-in-0 slide-in-from-bottom-2" style={{ animationDelay: '200ms' }}>
                  <button
                    onClick={() => mediaStepRef.current?.triggerUpload()}
                    className="btn-gold inline-flex items-center gap-3 px-10 py-4 text-base shadow-lg shadow-accent-gold/25 hover:shadow-accent-gold/40 hover:shadow-xl transition-all duration-300"
                    aria-label="Start a new project by uploading media"
                  >
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                      <polyline points="17 8 12 3 7 8" />
                      <line x1="12" y1="3" x2="12" y2="15" />
                    </svg>
                    Start Creating
                  </button>
                </div>
                <p className="text-text-muted text-sm mt-6 flex items-center justify-center gap-2 animate-in fade-in-0" style={{ animationDelay: '300ms' }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" className="text-accent-gold/60" strokeWidth="2">
                    <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
                  </svg>
                  Drag and drop files anywhere on this page
                </p>
              </div>
            </div>
          </section>
        )}

        {step === 'media' && (
          <MediaStep
            ref={mediaStepRef}
            media={media}
            onMediaChange={setMedia}
            onNext={() => setStep('template')}
            suggestedPickCount={suggestedPickCount}
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
            story={{
              plan: storyPlan,
              busy: storyBusy,
              error: storyError,
              available: storyKeys.length > 0,
              applied: storyApplied,
              onGenerate: generateStory,
              onApply: applyStory,
              onApplyText: selectedTemplate ? applyStoryText : undefined,
            }}
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
            storyPlan={storyApplied ? storyPlan : null}
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
            storyPlan={storyApplied ? storyPlan : null}
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
