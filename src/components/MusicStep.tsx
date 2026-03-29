'use client';

import { useRef, useState, useEffect, useCallback } from 'react';
import { MusicTrack, MediaFile } from '@/types';
import { SMART_TEMPLATES, expandTemplateForMedia, formatDuration as fmtDuration } from '@/lib/templates';
import { saveSongFromTrack, songExists, getSongCount } from '@/lib/song-library';
import SongLibrary from './SongLibrary';

interface MusicStepProps {
  music: MusicTrack | null;
  onMusicChange: (music: MusicTrack | null) => void;
  /** Ordered list of all music tracks */
  musicTracks?: MusicTrack[];
  onMusicTracksChange?: (tracks: MusicTrack[]) => void;
  photos: MediaFile[];
  durationPerPhoto?: number;
  selectedTemplate?: string | null;
  onNext: () => void;
  onBack: () => void;
}

export default function MusicStep({
  music,
  onMusicChange,
  musicTracks = [],
  onMusicTracksChange,
  photos,
  durationPerPhoto,
  selectedTemplate,
  onNext,
  onBack,
}: MusicStepProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [youtubeUrl, setYoutubeUrl] = useState('');
  const [ytLoading, setYtLoading] = useState(false);
  const [ytError, setYtError] = useState('');
  const [showLibrary, setShowLibrary] = useState(false);
  const [librarySongCount, setLibrarySongCount] = useState(0);
  const [dragIdx, setDragIdx] = useState<number | null>(null);

  const selectedMedia = photos.filter(p => p.selected);
  const baseTemplate = selectedTemplate ? SMART_TEMPLATES.find(t => t.id === selectedTemplate) : null;
  const template = baseTemplate ? expandTemplateForMedia(baseTemplate, selectedMedia.length) : null;
  const totalDuration = template ? template.totalDuration : selectedMedia.length * (durationPerPhoto ?? 3.5);

  // Total music duration from all tracks
  const totalMusicDuration = musicTracks.reduce((sum, t) => sum + t.duration, 0);

  // Load library count on mount
  useEffect(() => {
    getSongCount().then(setLibrarySongCount).catch(() => {});
  }, [showLibrary]);

  // Keep `music` (first track) in sync with `musicTracks`
  const updateTracks = useCallback((tracks: MusicTrack[]) => {
    if (onMusicTracksChange) {
      onMusicTracksChange(tracks);
    }
    // Set `music` to first track for backward compat (preview, etc.)
    onMusicChange(tracks.length > 0 ? tracks[0] : null);
  }, [onMusicChange, onMusicTracksChange]);

  const addTrack = useCallback(async (track: MusicTrack) => {
    const newTracks = [...musicTracks, track];
    updateTracks(newTracks);

    // Auto-save to library
    try {
      const exists = await songExists(track.name);
      if (!exists) {
        await saveSongFromTrack(track);
        const count = await getSongCount();
        setLibrarySongCount(count);
      }
    } catch (err) {
      console.warn('[MusicStep] Auto-save failed:', err);
    }
  }, [musicTracks, updateTracks]);

  const handleFileUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      if (!file.type.startsWith('audio/')) continue;

      const url = URL.createObjectURL(file);
      const duration = await getAudioDuration(url);

      await addTrack({
        id: `music-${Date.now()}-${i}`,
        name: file.name,
        file,
        url,
        duration,
        source: 'upload',
      });
    }
  };

  const handleYoutubeRip = async () => {
    if (!youtubeUrl.trim() || ytLoading) return;

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
      const ytTrack: MusicTrack = {
        id: `yt-${Date.now()}`,
        name: typeof data.title === 'string' ? data.title : 'YouTube Audio',
        url: typeof data.url === 'string' ? data.url : '',
        duration: typeof data.duration === 'number' ? data.duration : 0,
        source: 'youtube',
      };

      await addTrack(ytTrack);
      setYoutubeUrl('');
    } catch (e) {
      setYtError(e instanceof Error ? e.message : 'Extraction failed. Is yt-dlp installed on the server?');
    } finally {
      setYtLoading(false);
    }
  };

  const handleSelectFromLibrary = (track: MusicTrack) => {
    addTrack(track);
    setShowLibrary(false);
  };

  const removeTrack = (id: string) => {
    const track = musicTracks.find(t => t.id === id);
    if (track?.file) URL.revokeObjectURL(track.url);
    updateTracks(musicTracks.filter(t => t.id !== id));
    if (playingId === id) {
      if (audioRef.current) audioRef.current.pause();
      setPlayingId(null);
    }
  };

  const togglePlay = (track: MusicTrack) => {
    if (playingId === track.id) {
      if (audioRef.current) audioRef.current.pause();
      setPlayingId(null);
      return;
    }
    if (audioRef.current) audioRef.current.pause();
    const audio = new Audio(track.file ? URL.createObjectURL(track.file) : track.url);
    audioRef.current = audio;
    audio.onended = () => setPlayingId(null);
    audio.play().catch(() => {});
    setPlayingId(track.id);
  };

  const moveTrack = (fromIdx: number, toIdx: number) => {
    if (fromIdx === toIdx) return;
    const newTracks = [...musicTracks];
    const [moved] = newTracks.splice(fromIdx, 1);
    newTracks.splice(toIdx, 0, moved);
    updateTracks(newTracks);
  };

  // Drag handlers for reordering
  const handleDragStart = (idx: number) => setDragIdx(idx);
  const handleDragOver = (e: React.DragEvent, idx: number) => {
    e.preventDefault();
    if (dragIdx !== null && dragIdx !== idx) {
      moveTrack(dragIdx, idx);
      setDragIdx(idx);
    }
  };
  const handleDragEnd = () => setDragIdx(null);

  useEffect(() => {
    return () => {
      if (audioRef.current) audioRef.current.pause();
    };
  }, []);

  return (
    <div className="space-y-6 step-content">
      <div>
        <h2 className="text-lg font-bold text-white mb-1">Add Music</h2>
        <p className="text-sm text-text-muted">
          Video length: <span className="text-accent-gold font-mono">{fmtDuration(totalDuration)}</span>
          {template && <span className="text-text-muted"> ({template.name})</span>}
          {' '}&mdash; Add one or more songs. They play in order.
        </p>
      </div>

      {/* Track List */}
      {musicTracks.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-xs text-text-muted font-medium">
              Playlist ({musicTracks.length} song{musicTracks.length !== 1 ? 's' : ''})
            </p>
            <span className="text-xs text-accent-gold font-mono">
              {fmtDuration(totalMusicDuration)} total
            </span>
          </div>

          {musicTracks.map((track, idx) => (
            <div
              key={track.id}
              draggable
              onDragStart={() => handleDragStart(idx)}
              onDragOver={(e) => handleDragOver(e, idx)}
              onDragEnd={handleDragEnd}
              className={`card-glow p-3 flex items-center gap-3 transition-all ${
                dragIdx === idx ? 'opacity-50 scale-95' : ''
              }`}
              style={{ cursor: 'grab' }}
            >
              {/* Drag handle */}
              <div className="flex flex-col gap-0.5 text-text-muted cursor-grab active:cursor-grabbing">
                <div className="w-4 h-0.5 bg-text-muted/40 rounded" />
                <div className="w-4 h-0.5 bg-text-muted/40 rounded" />
                <div className="w-4 h-0.5 bg-text-muted/40 rounded" />
              </div>

              {/* Order number */}
              <span className="text-xs text-accent-gold font-mono font-bold w-5 text-center">
                {idx + 1}
              </span>

              {/* Play button */}
              <button
                onClick={(e) => { e.stopPropagation(); togglePlay(track); }}
                className="w-9 h-9 rounded-full bg-accent-gold/10 border border-accent-gold/30 flex items-center justify-center flex-shrink-0 hover:bg-accent-gold/20 transition-colors"
                aria-label={playingId === track.id ? 'Pause' : 'Play'}
              >
                {playingId === track.id ? (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" className="text-accent-gold">
                    <rect x="6" y="4" width="4" height="16" />
                    <rect x="14" y="4" width="4" height="16" />
                  </svg>
                ) : (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" className="text-accent-gold ml-0.5">
                    <polygon points="5 3 19 12 5 21" />
                  </svg>
                )}
              </button>

              {/* Track info */}
              <div className="flex-1 min-w-0">
                <p className="text-sm text-white font-medium truncate">{track.name}</p>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="text-xs text-text-muted font-mono">{formatDuration(track.duration)}</span>
                  <span className="text-[10px] text-accent-gold/60 bg-accent-gold/10 px-1.5 py-0.5 rounded-full capitalize">
                    {track.source}
                  </span>
                </div>
              </div>

              {/* Move buttons */}
              <div className="flex flex-col gap-0.5">
                <button
                  onClick={(e) => { e.stopPropagation(); if (idx > 0) moveTrack(idx, idx - 1); }}
                  disabled={idx === 0}
                  className="text-text-muted hover:text-white disabled:opacity-20 p-0.5"
                  aria-label="Move up"
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polyline points="18 15 12 9 6 15" />
                  </svg>
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); if (idx < musicTracks.length - 1) moveTrack(idx, idx + 1); }}
                  disabled={idx === musicTracks.length - 1}
                  className="text-text-muted hover:text-white disabled:opacity-20 p-0.5"
                  aria-label="Move down"
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polyline points="6 9 12 15 18 9" />
                  </svg>
                </button>
              </div>

              {/* Remove button */}
              <button
                onClick={(e) => { e.stopPropagation(); removeTrack(track.id); }}
                className="text-text-muted hover:text-red-400 transition-colors p-1.5"
                aria-label="Remove track"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
          ))}

          {/* Duration comparison */}
          <div className="card-glow p-3">
            <div className="flex items-center justify-between text-xs text-text-muted mb-1.5">
              <span>Music vs Video</span>
              <span className="font-mono">
                {totalMusicDuration > totalDuration
                  ? `Music ${fmtDuration(totalMusicDuration - totalDuration)} longer — will be trimmed`
                  : totalMusicDuration < totalDuration
                  ? `Music ${fmtDuration(totalDuration - totalMusicDuration)} shorter — last track will loop`
                  : 'Perfect match!'}
              </span>
            </div>
            <div className="flex gap-1 items-center">
              <div className="flex-1 h-2 rounded bg-bg-input overflow-hidden">
                <div
                  className="h-full rounded"
                  style={{
                    width: `${Math.min(100, (totalDuration / Math.max(totalMusicDuration, totalDuration)) * 100)}%`,
                    background: 'linear-gradient(90deg, #FFD700, #FFBF00)',
                  }}
                />
              </div>
              <span className="text-[10px] font-mono text-accent-gold w-10 text-right">{fmtDuration(totalDuration)}</span>
            </div>
            <div className="flex gap-1 items-center mt-1">
              <div className="flex-1 h-2 rounded bg-bg-input overflow-hidden relative">
                {/* Show each track as a segment */}
                <div className="flex h-full">
                  {musicTracks.map((track, i) => {
                    const pct = totalMusicDuration > 0
                      ? (track.duration / Math.max(totalMusicDuration, totalDuration)) * 100
                      : 0;
                    const colors = ['#60A5FA', '#A78BFA', '#F472B6', '#34D399', '#FBBF24'];
                    return (
                      <div
                        key={track.id}
                        className="h-full"
                        style={{
                          width: `${pct}%`,
                          background: colors[i % colors.length],
                          borderRight: i < musicTracks.length - 1 ? '1px solid rgba(0,0,0,0.3)' : undefined,
                        }}
                        title={`${track.name} (${formatDuration(track.duration)})`}
                      />
                    );
                  })}
                </div>
              </div>
              <span className="text-[10px] font-mono text-blue-400 w-10 text-right">{fmtDuration(totalMusicDuration)}</span>
            </div>
            <div className="flex items-center gap-3 mt-1.5 text-[10px] text-text-muted">
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-sm" style={{ background: '#FFD700' }} />
                Video
              </span>
              {musicTracks.map((track, i) => {
                const colors = ['#60A5FA', '#A78BFA', '#F472B6', '#34D399', '#FBBF24'];
                return (
                  <span key={track.id} className="flex items-center gap-1 truncate max-w-[100px]">
                    <span className="w-2 h-2 rounded-sm flex-shrink-0" style={{ background: colors[i % colors.length] }} />
                    <span className="truncate">{track.name}</span>
                  </span>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Song Library Panel */}
      {showLibrary && (
        <SongLibrary
          onSelectSong={handleSelectFromLibrary}
          onClose={() => setShowLibrary(false)}
        />
      )}

      {/* Upload options — always visible to add more songs */}
      {!showLibrary && (
        <div className="space-y-4">
          {/* Library button */}
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
            {/* File upload — supports multiple files */}
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
                multiple
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
              <p className="text-sm text-white font-semibold">
                {musicTracks.length > 0 ? 'Add More Songs' : 'Upload Audio Files'}
              </p>
              <p className="text-xs text-text-muted mt-1">MP3, WAV, AAC, OGG — select multiple</p>
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
          {musicTracks.length > 0 ? 'Review & Export' : 'Skip Music & Export'}
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
