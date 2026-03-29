'use client';

import { useState, useCallback } from 'react';
import Header from '@/components/Header';
import MediaStep from '@/components/MediaStep';
import TemplateStep from '@/components/TemplateStep';
import MusicStep from '@/components/MusicStep';
import RenderStep from '@/components/RenderStep';
import { MediaFile, MusicTrack, Step } from '@/types';

export default function Home() {
  const [step, setStep] = useState<Step>('media');
  const [media, setMedia] = useState<MediaFile[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null);
  const [music, setMusic] = useState<MusicTrack | null>(null);
  const [title, setTitle] = useState('');
  const [aspectRatio, setAspectRatio] = useState<'16:9' | '9:16' | '1:1'>('16:9');
  const [outputQuality, setOutputQuality] = useState<'720p' | '1080p' | '4k'>('1080p');
  const [textOverrides, setTextOverrides] = useState<Record<number, string | null>>({});

  const selectedCount = media.filter(p => p.selected).length;

  const canNavigate = useCallback((target: Step): boolean => {
    const steps: Step[] = ['media', 'template', 'music', 'render'];
    const targetIdx = steps.indexOf(target);
    const currentIdx = steps.indexOf(step);

    if (targetIdx <= currentIdx) return true;
    if (targetIdx >= 1 && selectedCount < 2) return false;
    if (targetIdx >= 2 && !selectedTemplate) return false;
    return true;
  }, [step, selectedCount, selectedTemplate]);

  return (
    <div className="min-h-screen flex flex-col">
      <Header currentStep={step} onStepClick={setStep} canNavigate={canNavigate} />

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
            onSelectTemplate={(id) => { setSelectedTemplate(id); setTextOverrides({}); }}
            media={media}
            aspectRatio={aspectRatio}
            onAspectChange={setAspectRatio}
            textOverrides={textOverrides}
            onTextOverridesChange={setTextOverrides}
            onNext={() => setStep('music')}
            onBack={() => setStep('media')}
          />
        )}

        {step === 'music' && (
          <MusicStep
            music={music}
            onMusicChange={setMusic}
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
            onBack={() => setStep('music')}
          />
        )}
      </main>

      <footer className="border-t border-border-subtle py-4">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 flex items-center justify-between text-xs text-text-muted">
          <span className="font-mono">PHOTOFORGE v3.0</span>
          <span>Built by ELAV8</span>
        </div>
      </footer>
    </div>
  );
}
