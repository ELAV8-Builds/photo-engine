'use client';

import { useRouter } from 'next/navigation';
import ProjectGrid from '@/components/ProjectGrid';

export default function ProjectsPage() {
  const router = useRouter();

  const handleLoadProject = (id: string) => {
    // Navigate to home with project ID as query param
    router.push(`/?project=${id}`);
  };

  return (
    <div className="min-h-screen flex flex-col">
      {/* Header */}
      <header className="border-b border-border-subtle bg-bg-card/80 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-3">
              <img src="/icons/logo.svg" alt="" className="w-8 h-8" aria-hidden="true" />
              <div>
                <h1 className="text-sm font-bold text-white tracking-wide">
                  PHOTO<span className="text-accent-gold">FORGE</span>
                </h1>
                <p className="text-[10px] text-text-muted font-mono tracking-widest uppercase">
                  AI Presentations
                </p>
              </div>
            </div>

            <nav className="flex items-center gap-3">
              <button
                onClick={() => router.push('/')}
                className="px-4 py-2 rounded-lg text-xs font-medium text-accent-gold hover:bg-accent-gold/10 transition-colors flex items-center gap-2"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="12" y1="5" x2="12" y2="19" />
                  <line x1="5" y1="12" x2="19" y2="12" />
                </svg>
                New Project
              </button>
            </nav>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-5xl mx-auto w-full px-4 sm:px-6 py-8">
        <ProjectGrid onLoadProject={handleLoadProject} />
      </main>

      <footer className="border-t border-border-subtle py-4">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 flex items-center justify-between text-xs text-text-muted">
          <span className="font-mono">PHOTOFORGE v4.0</span>
          <span>Built by ELAV8</span>
        </div>
      </footer>
    </div>
  );
}
