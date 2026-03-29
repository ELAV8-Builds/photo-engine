'use client';

import { useRef, useState, useEffect } from 'react';
import { MusicTrack, MediaFile } from '@/types';
import { SMART_TEMPLATES, formatDuration as fmtDuration } from '@/lib/templates';
import { saveSongFromTrack, songExists, getSongCount } from '@/lib/song-library';
import SongLibrary from './SongLibrary';

interface MusicStepProps {
  music: MusicTrack | null;
  onMusicChange: (music: MusicTrack | null) => void;
  photos: MediaFile[];
  durationPerPhoto?: number; // legacy — ignored if selectedTemplate is provided
  selectedTemplate?: string | null;
  onNext: () => void;
  onBack: () => void;
}

export default function MusicStep({
  music,
  onMusicChange,
  photos,
  durationPerPhoto,
  selectedTemplate,
  onNext,
  onBack,
}: MusicStepProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [youtubeUrl, setYoutubeUrl] = useState('');
  const [ytLoading, setYtLoading] = useState(false);
  const [ytError, setYtError] = useState('');
  const [showLibrary, setShowLibrary] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState('');
  const [librarySongCount, setLibrarySongCount] = useState(0);

  const selectedMedia = photos.filter(p => p.selected);
  const template = selectedTemplate ? SMART_TEMPLATES.find(t => t.id === selectedTemplate) : null;
  const totalDuration = template ? template.totalDuration : selectedMedia.length * (durationPerPhoto ?? 3.5);

  // Load library count on mount
  useEffect(() => {
    getSongCount().then(setLibrarySongCount).catch(() => {});
  }, [showLibrary]);

  const handleFileUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const file = files[0];
    if (!file.type.startsWith('audio/')) return;

    const url = URL.createObjectURL(file);
    const duration = await getAudioDuration(url);

    onMusicChange({
      id: `music-${Date.now()}`,
      name: file.name,
      file,
      url,
      duration,
      source: 'upload',
    });
  };

  const handleYoutubeRip = async () => {
    if (!youtubeUrl.trim() || ytLoading) return;

    // Validate URL
    const ytRegex = /^(https?:\/\/)?(www\.)?(youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/shorts\/)/;
    if (!ytRegex.test(youtubeUrl)) {
      setYtError('Please enter a valid YouTube URL');
      return;
    }

    setYtLoading(true);
    setYtError('');

    try {
      const res = await fetch('/api/youtube-audio', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: youtubeUrl }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(typeof data.error === 'string' ? data.error : 'Failed to extract audio');
      }

      const data = await res.json();
      onMusicChange({
        id: `yt-${Date.now()}`,
        name: typeof data.title === 'string' ? data.title : 'YouTube Audio',
        url: typeof data.url === 'string' ? data.url : '',
        duration: typeof data.duration === 'number' ? data.duration : 0,
        source: 'youtube',
      });
      setYoutubeUrl('');
    } catch (e) {
      setYtError(e instanceof Error ? e.message : 'Extraction failed. Is yt-dlp installed on the server?');
    } finally {
      setYtLoading(false);
    }
  };

  const handleSaveToLibrary = async () => {
    if (!music || saving) return;

    setSaving(true);
    setSaveMessage('');

    try {
      // Check if already exists
      const exists = await songExists(music.name);
      if (exists) {
        setSaveMessage('Already in library');
        setTimeout(() => setSaveMessage(''), 3000);
        return;
      }

      await saveSongFromTrack(music);
      setSaveMessage('Saved to library!');
      const count = await getSongCount();
      setLibrarySongCount(count);
      setTimeout(() => setSaveMessage(''), 3000);
    } catch (err) {
      console.error('[MusicStep] Failed to save to library:', err);
      setSaveMessage('Save failed');
      setTimeout(() => setSaveMessage(''), 3000);
    } finally {
      setSaving(false);
    }
  };

  const handleSelectFromLibrary = (track: MusicTrack) => {
    onMusicChange(track);
    setShowLibrary(false);
  };

  const removeMusic = () => {
    if (music?.file) URL.revokeObjectURL(music.url);
    onMusicChange(null);
    setPlaying(false);
  };

  const togglePlay = () => {
    if (!audioRef.current) return;
    if (playing) {
      audioRef.current.pause();
    } else {
      audioRef.current.play();
    }
    setPlaying(!playing);
  };

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const handleEnd = () => setPlaying(false);
    audio.addEventListener('ended', handleEnd);
    return () => audio.removeEventListener('ended', handleEnd);
  }, [music]);

  return (
    <div className="space-y-6 step-content">
      <div>
        <h2 className="text-lg font-bold text-white mb-1">Add Music</h2>
        <p className="text-sm text-text-muted">
          Video length: <span className="text-accent-gold font-mono">{fmtDuration(totalDuration)}</span>
          {template && <span className="text-text-muted"> ({template.name})</span>}
          {' '}&mdash; Music is optional
        </p>
      </div>

      {/* Current track */}
      {music && (
        <div className="card-glow p-5">
          <div className="flex items-center gap-4">
            <button
              onClick={togglePlay}
              className="w-12 h-12 rounded-full bg-accent-gold/10 border border-accent-gold/30 flex items-center justify-center flex-shrink-0 hover:bg-accent-gold/20 transition-colors"
              aria-label={playing ? 'Pause' : 'Play'}
            >
              {playing ? (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" className="text-accent-gold">
                  <rect x="6" y="4" width="4" height="16" />
                  <rect x="14" y="4" width="4" height="16" />
                </svg>
              ) : (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" className="text-accent-gold ml-0.5">
                  <polygon points="5 3 19 12 5 21" />
                </svg>
              )}
            </button>

            <div className="flex-1 min-w-0">
              <p className="text-sm text-white font-semibold truncate">{music.name}</p>
              <div className="flex items-center gap-3 mt-0.5">
                <span className="text-xs text-text-muted font-mono">
                  {formatDuration(music.duration)}
                </span>
                <span className="text-xs text-accent-gold/60 bg-accent-gold/10 px-2 py-0.5 rounded-full capitalize">
                  {music.source}
                </span>
              </div>
            </div>

            {/* Save to Library button */}
            <button
              onClick={handleSaveToLibrary}
              disabled={saving}
              className="text-text-muted hover:text-purple-400 transition-colors p-2 relative group"
              aria-label="Save to library"
              title="Save to library"
            >
              {saving ? (
                <div className="w-4 h-4 border-2 border-purple-400 border-t-transparent rounded-full animate-spin" />
              ) : (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M12 2L2 7l10 5 10-5-10-5z" />
                  <path d="M2 17l10 5 10-5" />
                  <path d="M2 12l10 5 10-5" />
                </svg>
              )}
            </button>

            <button
              onClick={removeMusic}
              className="text-text-muted hover:text-red-400 transition-colors p-2"
              aria-label="Remove track"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>

          {/* Save confirmation message */}
          {saveMessage && (
            <div className={`mt-2 text-xs font-medium text-center py-1 px-3 rounded-full ${
              saveMessage.includes('Saved') ? 'text-green-400 bg-green-500/10' :
              saveMessage.includes('Already') ? 'text-yellow-400 bg-yellow-500/10' :
              'text-red-400 bg-red-500/10'
            }`}>
              {saveMessage}
            </div>
          )}

          {music.url && <audio ref={audioRef} src={music.url} preload="metadata" />}

          {/* Duration comparison */}
          {music.duration > 0 && (
            <div className="mt-3 pt-3 border-t border-border-subtle">
              <div className="flex items-center justify-between text-xs text-text-muted mb-1.5">
                <span>Music vs Video</span>
                <span className="font-mono">
                  {music.duration > totalDuration
                    ? `Music ${fmtDuration(music.duration - totalDuration)} longer — will be trimmed`
                    : music.duration < totalDuration
                    ? `Music ${fmtDuration(totalDuration - music.duration)} shorter — will loop`
                    : 'Perfect match!'}
                </span>
              </div>
              <div className="flex gap-1 items-center">
                <div className="flex-1 h-2 rounded bg-bg-input overflow-hidden">
                  <div
                    className="h-full rounded"
                    style={{
                      width: `${Math.min(100, (totalDuration / Math.max(music.duration, totalDuration)) * 100)}%`,
                      background: 'linear-gradient(90deg, #FFD700, #FFBF00)',
                    }}
                  />
                </div>
                <span className="text-[10px] font-mono text-accent-gold w-10 text-right">{fmtDuration(totalDuration)}</span>
              </div>
              <div className="flex gap-1 items-center mt-1">
                <div className="flex-1 h-2 rounded bg-bg-input overflow-hidden">
                  <div
                    className="h-full rounded"
                    style={{
                      width: `${Math.min(100, (music.duration / Math.max(music.duration, totalDuration)) * 100)}%`,
                      background: 'linear-gradient(90deg, #60A5FA, #3B82F6)',
                    }}
                  />
                </div>
                <span className="text-[10px] font-mono text-blue-400 w-10 text-right">{fmtDuration(music.duration)}</span>
              </div>
              <div className="flex items-center gap-3 mt-1.5 text-[10px] text-text-muted">
                <span className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded-sm" style={{ background: '#FFD700' }} />
                  Video
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded-sm" style={{ background: '#60A5FA' }} />
                  Music
                </span>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Song Library Panel */}
      {showLibrary && (
        <SongLibrary
          onSelectSong={handleSelectFromLibrary}
          onClose={() => setShowLibrary(false)}
        />
      )}

      {/* Upload options */}
      {!music && !showLibrary && (
        <div className="space-y-4">
          {/* Library button — shown above upload options */}
          {librarySongCount > 0 && (
            <button
              onClick={() => setShowLibrary(true)}
              className="w-full card-glow p-4 flex items-center justify-between hover:shadow-gold-sm transition-all group"
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-purple-500/10 border border-purple-500/20 flex items-center justify-center group-hover:shadow-[0_0_10px_rgba(168,85,247,0.2)] transition-shadow">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" className="text-purple-400" strokeWidth="1.5">
                    <path d="M12 2L2 7l10 5 10-5-10-5z" />
                    <path d="M2 17l10 5 10-5" />
                    <path d="M2 12l10 5 10-5" />
                  </svg>
                </div>
                <div className="text-left">
                  <p className="text-sm text-white font-semibold">Song Library</p>
                  <p className="text-xs text-text-muted">{librarySongCount} song{librarySongCount !== 1 ? 's' : ''} saved</p>
                </div>
              </div>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" className="text-text-muted group-hover:text-purple-400 transition-colors" strokeWidth="2">
                <polyline points="9 18 15 12 9 6" />
              </svg>
            </button>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* File upload */}
            <div
              onClick={() => fileInputRef.current?.click()}
              className="card-glow p-6 text-center cursor-pointer hover:shadow-gold-sm transition-all group"
              role="button"
              tabIndex={0}
              onKeyDown={(e) => e.key === 'Enter' && fileInputRef.current?.click()}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept="audio/*"
                onChange={(e) => handleFileUpload(e.target.files)}
                className="hidden"
              />
              <div className="w-12 h-12 mx-auto rounded-xl bg-accent-gold/10 border border-accent-gold/20 flex items-center justify-center mb-3 group-hover:shadow-gold-sm transition-shadow">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" className="text-accent-gold" strokeWidth="1.5">
                  <path d="M9 18V5l12-2v13" />
                  <circle cx="6" cy="18" r="3" />
                  <circle cx="18" cy="16" r="3" />
                </svg>
              </div>
              <p className="text-sm text-white font-semibold">Upload Audio File</p>
              <p className="text-xs text-text-muted mt-1">MP3, WAV, AAC, OGG</p>
            </div>

            {/* YouTube */}
            <div className="card-glow p-6">
              <div className="w-12 h-12 mx-auto rounded-xl bg-red-500/10 border border-red-500/20 flex items-center justify-center mb-3">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor" className="text-red-500">
                  <path d="M23 9.7s-.2-1.7-1-2.4c-.9-1-1.9-1-2.4-1C16.3 6 12 6 12 6s-4.3 0-7.6.3c-.5 0-1.5 0-2.4 1-.7.7-1 2.4-1 2.4S.8 11.6.8 13.5v1.8c0 1.9.2 3.7.2 3.7s.2 1.7 1 2.4c.9 1 2.1.9 2.6 1 1.9.2 8.4.2 8.4.2s4.3 0 7.6-.3c.5 0 1.5 0 2.4-1 .7-.7 1-2.4 1-2.4s.2-1.9.2-3.7v-1.8c0-1.9-.2-3.7-.2-3.7zM9.5 16.2V9.8L16 13l-6.5 3.2z"/>
                </svg>
              </div>
              <p className="text-sm text-white font-semibold text-center mb-3">YouTube Audio</p>

              <div className="flex gap-2">
                <input
                  type="text"
                  value={youtubeUrl}
                  onChange={(e) => { setYoutubeUrl(e.target.value); setYtError(''); }}
                  placeholder="https://youtube.com/watch?v=..."
                  disabled={ytLoading}
                  className="flex-1 px-3 py-2 bg-bg-input border border-border-subtle rounded-lg text-sm text-white placeholder:text-text-muted focus:border-accent-gold focus:outline-none disabled:opacity-50"
                />
                <button
                  onClick={handleYoutubeRip}
                  disabled={ytLoading || !youtubeUrl.trim()}
                  className="btn-gold px-3 py-2 text-xs whitespace-nowrap"
                >
                  {ytLoading ? (
                    <div className="w-4 h-4 border-2 border-bg-main border-t-transparent rounded-full animate-spin" />
                  ) : (
                    'Rip'
                  )}
                </button>
              </div>
              {ytError && <p className="text-xs text-red-400 mt-2">{ytError}</p>}
              <p className="text-[10px] text-text-muted mt-2 text-center">Requires yt-dlp on backend</p>
            </div>
          </div>
        </div>
      )}

      {/* Navigation */}
      <div className="flex items-center justify-between pt-4">
        <button onClick={onBack} className="btn-outline">
          Back
        </button>
        <button onClick={onNext} className="btn-gold inline-flex items-center gap-2">
          {music ? 'Review & Export' : 'Skip Music & Export'}
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="5" y1="12" x2="19" y2="12" />
            <polyline points="12 5 19 12 12 19" />
          </svg>
        </button>
      </div>
    </div>
  );
}

function getAudioDuration(url: string): Promise<number> {
  return new Promise((resolve) => {
    const audio = new Audio();
    audio.onloadedmetadata = () => resolve(audio.duration);
    audio.onerror = () => resolve(0);
    audio.src = url;
  });
}

function formatDuration(seconds: number): string {
  if (!seconds || seconds <= 0) return '0:00';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}
