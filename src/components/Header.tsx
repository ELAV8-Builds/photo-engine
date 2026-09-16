'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Step } from '@/types';

const STEPS: { id: Step; label: string; num: number }[] = [
  { id: 'media', label: 'Media', num: 1 },
  { id: 'template', label: 'Template', num: 2 },
  { id: 'music', label: 'Music', num: 3 },
  { id: 'render', label: 'Export', num: 4 },
];

interface HeaderProps {
  currentStep: Step;
  onStepClick: (step: Step) => void;
  canNavigate: (step: Step) => boolean;
  projectName?: string;
}

export default function Header({ currentStep, onStepClick, canNavigate, projectName }: HeaderProps) {
  const currentIndex = STEPS.findIndex(s => s.id === currentStep);
  const pathname = usePathname();

  return (
    <header className="border-b border-border-subtle bg-bg-card/80 backdrop-blur-md sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <div className="flex items-center gap-3">
            <img src="/icons/logo.svg" alt="" className="w-8 h-8" aria-hidden="true" />
            <div>
              <h1 className="text-sm font-bold text-white tracking-wide">
                PHOTO<span className="text-accent-gold">FORGE</span>
              </h1>
              <p className="text-[10px] text-text-muted font-mono tracking-widest uppercase">
                {projectName || 'AI Presentations'}
              </p>
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
                    {/* lg, not md: with all four steps plus the two links, the labels need ~860px (768px overflowed — Phase 9 QA). */}
                    <span className="hidden lg:inline">{step.label}</span>
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

          {/* Right side: Projects link + Mobile step indicator */}
          <div className="flex items-center gap-3">
            <Link
              href="/projects"
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                pathname.startsWith('/projects')
                  ? 'bg-accent-gold/10 text-accent-gold border border-accent-gold/30'
                  : 'text-text-muted hover:text-white hover:bg-white/5'
              }`}
              aria-current={pathname.startsWith('/projects') ? 'page' : undefined}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z" />
              </svg>
              <span className="hidden lg:inline">Projects</span>
            </Link>
            <Link
              href="/settings"
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                pathname.startsWith('/settings')
                  ? 'bg-accent-gold/10 text-accent-gold border border-accent-gold/30'
                  : 'text-text-muted hover:text-white hover:bg-white/5'
              }`}
              aria-current={pathname.startsWith('/settings') ? 'page' : undefined}
              aria-label="Settings"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
                <circle cx="12" cy="12" r="3" />
                <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
              </svg>
              <span className="hidden lg:inline">Settings</span>
            </Link>

            {/* Mobile step indicator */}
            <div className="sm:hidden text-xs text-text-muted font-mono">
              {currentIndex + 1}/{STEPS.length}
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}
