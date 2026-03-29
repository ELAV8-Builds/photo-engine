'use client';

import { Step } from '@/types';

const STEPS: { id: Step; label: string; num: number }[] = [
  { id: 'photos', label: 'Photos', num: 1 },
  { id: 'template', label: 'Template', num: 2 },
  { id: 'music', label: 'Music', num: 3 },
  { id: 'render', label: 'Export', num: 4 },
];

interface HeaderProps {
  currentStep: Step;
  onStepClick: (step: Step) => void;
  canNavigate: (step: Step) => boolean;
}

export default function Header({ currentStep, onStepClick, canNavigate }: HeaderProps) {
  const currentIndex = STEPS.findIndex(s => s.id === currentStep);

  return (
    <header className="border-b border-border-subtle bg-bg-card/80 backdrop-blur-md sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-accent-gold to-accent-amber flex items-center justify-center">
              <span className="text-bg-main font-black text-sm">PF</span>
            </div>
            <div>
              <h1 className="text-sm font-bold text-white tracking-wide">
                PHOTO<span className="text-accent-gold">FORGE</span>
              </h1>
              <p className="text-[10px] text-text-muted font-mono tracking-widest uppercase">AI Presentations</p>
            </div>
          </div>

          {/* Step Indicator */}
          <nav className="hidden sm:flex items-center gap-1" aria-label="Build steps">
            {STEPS.map((step, i) => {
              const isActive = step.id === currentStep;
              const isComplete = i < currentIndex;
              const isClickable = canNavigate(step.id);

              return (
                <div key={step.id} className="flex items-center">
                  <button
                    onClick={() => isClickable && onStepClick(step.id)}
                    disabled={!isClickable}
                    className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                      isActive
                        ? 'bg-accent-gold/10 text-accent-gold border border-accent-gold/30'
                        : isComplete
                        ? 'text-accent-gold/60 hover:bg-accent-gold/5'
                        : 'text-text-muted'
                    } ${isClickable ? 'cursor-pointer' : 'cursor-default'}`}
                    aria-current={isActive ? 'step' : undefined}
                    aria-label={`Step ${step.num}: ${step.label}`}
                  >
                    <span
                      className={`step-dot w-5 h-5 text-[10px] ${
                        isActive ? 'active' : isComplete ? 'complete' : 'pending'
                      }`}
                    >
                      {isComplete ? '\u2713' : step.num}
                    </span>
                    <span className="hidden md:inline">{step.label}</span>
                  </button>
                  {i < STEPS.length - 1 && (
                    <div
                      className={`w-6 h-px mx-1 ${
                        i < currentIndex ? 'bg-accent-gold/30' : 'bg-border-subtle'
                      }`}
                      aria-hidden="true"
                    />
                  )}
                </div>
              );
            })}
          </nav>

          {/* Mobile step indicator */}
          <div className="sm:hidden text-xs text-text-muted font-mono">
            {currentIndex + 1}/{STEPS.length}
          </div>
        </div>
      </div>
    </header>
  );
}
