'use client';

import { useState, useCallback } from 'react';
import Header from '@/components/Header';
import PhotoStep from '@/components/PhotoStep';
import TemplateStep from '@/components/TemplateStep';
import MusicStep from '@/components/MusicStep';
import RenderStep from '@/components/RenderStep';
import { PhotoFile, MusicTrack, Step } from '@/types';

export default function Home() {
  const [step, setStep] = useState<Step>('photos');
  const [photos, setPhotos] = useState<PhotoFile[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null);
  const [music, setMusic] = useState<MusicTrack | null>(null);
  const [title, setTitle] = useState('');
  const [durationPerPhoto, setDurationPerPhoto] = useState(3.5);
  const [aspectRatio, setAspectRatio] = useState<'16:9' | '9:16' | '1:1'>('16:9');
  const [outputQuality, setOutputQuality] = useState<'720p' | '1080p' | '4k'>('1080p');

  const selectedCount = photos.filter(p => p.selected).length;

  const canNavigate = useCallback((target: Step): boolean => {
    const steps: Step[] = ['photos', 'template', 'music', 'render'];
    const targetIdx = steps.indexOf(target);
    const currentIdx = steps.indexOf(step);

    // Can always go back
    if (targetIdx <= currentIdx) return true;

    // Forward: check prerequisites
    if (targetIdx >= 1 && selectedCount < 2) return false;
    if (targetIdx >= 2 && !selectedTemplate) return false;
    return true;
  }, [step, selectedCount, selectedTemplate]);

  return (
    <div className="min-h-screen flex flex-col">
      <Header currentStep={step} onStepClick={setStep} canNavigate={canNavigate} />

      <main id="main-content" className="flex-1 max-w-5xl mx-auto w-full px-4 sm:px-6 py-8">
        {step === 'photos' && (
          <PhotoStep
            photos={photos}
            onPhotosChange={setPhotos}
            onNext={() => setStep('template')}
          />
        )}

        {step === 'template' && (
          <TemplateStep
            selectedTemplate={selectedTemplate}
            onSelectTemplate={setSelectedTemplate}
            photos={photos}
            durationPerPhoto={durationPerPhoto}
            onDurationChange={setDurationPerPhoto}
            aspectRatio={aspectRatio}
            onAspectChange={setAspectRatio}
            onNext={() => setStep('music')}
            onBack={() => setStep('photos')}
          />
        )}

        {step === 'music' && (
          <MusicStep
            music={music}
            onMusicChange={setMusic}
            photos={photos}
            durationPerPhoto={durationPerPhoto}
            onNext={() => setStep('render')}
            onBack={() => setStep('template')}
          />
        )}

        {step === 'render' && (
          <RenderStep
            photos={photos}
            selectedTemplate={selectedTemplate}
            music={music}
            title={title}
            onTitleChange={setTitle}
            durationPerPhoto={durationPerPhoto}
            aspectRatio={aspectRatio}
            outputQuality={outputQuality}
            onQualityChange={setOutputQuality}
            onBack={() => setStep('music')}
          />
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-border-subtle py-4">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 flex items-center justify-between text-xs text-text-muted">
          <span className="font-mono">PHOTOFORGE v1.0</span>
          <span>Built by ELAV8</span>
        </div>
      </footer>
    </div>
  );
}
