'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import LibraryPanel from '@/components/LibraryPanel';
import type { MediaFile } from '@/types';

export default function LibraryPage() {
  const router = useRouter();
  const [added, setAdded] = useState<MediaFile[]>([]);

  const handleAddMedia = (items: MediaFile[]) => {
    setAdded((prev) => [...prev, ...items]);
  };

  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b border-border-subtle bg-bg-card/80 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-3">
              <img src="/icons/logo.svg" alt="" className="w-8 h-8" aria-hidden="true" />
              <div>
                <div className="text-sm font-bold text-white tracking-wide" aria-label="PhotoForge Library">
                  PHOTO<span className="text-accent-gold">FORGE</span>
                </div>
                <p className="text-[10px] text-text-muted font-mono tracking-widest uppercase">Media Library</p>
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
                Start Creating
              </button>
            </nav>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 py-8">
        <div className="mb-6">
          <h1 className="text-xl font-bold text-white mb-2">Media Library</h1>
          <p className="text-text-muted text-sm">
            Register folders to import photos and videos. Items are indexed in the background and ready when they appear here.
          </p>
        </div>

        <div className="card-glow p-6">
          <LibraryPanel
            inProjectIds={new Set()}
            inProjectMediaIds={new Set()}
            suggestedPickCount={10}
            onAddMedia={handleAddMedia}
          />
        </div>

        {added.length > 0 && (
          <div className="mt-6">
            <div className="flex items-center gap-2 text-sm text-accent-gold">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M22 11.08V12a10 10 0 11-5.93-9.14" />
                <polyline points="22 4 12 14.01 9 11.01" />
              </svg>
              <span>{added.length} item{added.length === 1 ? '' : 's'} added</span>
            </div>
          </div>
        )}
      </main>

      <footer className="border-t border-border-subtle py-4">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 flex items-center justify-between text-xs text-text-muted">
          <span className="font-mono">PHOTOFORGE v4.0</span>
          <span>Built by ELAV8</span>
        </div>
      </footer>
    </div>
  );
}
