'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { MusicTrack } from '@/types';
import {
  getAllSongsMeta,
  getSong,
  deleteSong,
  searchSongs,
  createSongUrl,
  getSongCount,
  type LibrarySongMeta,
} from '@/lib/song-library';

interface SongLibraryProps {
  onSelectSong: (track: MusicTrack) => void;
  onClose: () => void;
}

export default function SongLibrary({ onSelectSong, onClose }: SongLibraryProps) {
  const [songs, setSongs] = useState<LibrarySongMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [songCount, setSongCount] = useState(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioUrlRef = useRef<string | null>(null);

  const loadSongs = useCallback(async () => {
    setLoading(true);
    try {
      const results = searchQuery
        ? await searchSongs(searchQuery)
        : await getAllSongsMeta();
      setSongs(results);
      const count = await getSongCount();
      setSongCount(count);
    } catch (err) {
      console.error('[SongLibrary] Failed to load songs:', err);
    } finally {
      setLoading(false);
    }
  }, [searchQuery]);

  useEffect(() => {
    loadSongs();
  }, [loadSongs]);

  // Cleanup audio on unmount
  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
      if (audioUrlRef.current) {
        URL.revokeObjectURL(audioUrlRef.current);
        audioUrlRef.current = null;
      }
    };
  }, []);

  const handlePreview = async (songMeta: LibrarySongMeta) => {
    // If already playing this song, stop it
    if (playingId === songMeta.id) {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
      if (audioUrlRef.current) {
        URL.revokeObjectURL(audioUrlRef.current);
        audioUrlRef.current = null;
      }
      setPlayingId(null);
      return;
    }

    // Stop current playback
    if (audioRef.current) {
      audioRef.current.pause();
    }
    if (audioUrlRef.current) {
      URL.revokeObjectURL(audioUrlRef.current);
    }

    // Load and play
    const song = await getSong(songMeta.id);
    if (!song) return;

    const url = createSongUrl(song);
    audioUrlRef.current = url;
    const audio = new Audio(url);
    audioRef.current = audio;
    audio.onended = () => setPlayingId(null);
    audio.play();
    setPlayingId(songMeta.id);
  };

  const handleSelect = async (songMeta: LibrarySongMeta) => {
    setLoadingId(songMeta.id);
    try {
      const song = await getSong(songMeta.id);
      if (!song) return;

      const url = createSongUrl(song);
      const file = new File([song.audioBlob], song.originalName, { type: song.mimeType });

      onSelectSong({
        id: `lib-${song.id}`,
        name: song.name,
        file,
        url,
        duration: song.duration,
        source: song.source,
      });
    } catch (err) {
      console.error('[SongLibrary] Failed to load song:', err);
    } finally {
      setLoadingId(null);
    }
  };

  const handleDelete = async (id: string) => {
    setDeletingId(id);
    try {
      // Stop playback if deleting the playing song
      if (playingId === id) {
        if (audioRef.current) audioRef.current.pause();
        setPlayingId(null);
      }
      await deleteSong(id);
      await loadSongs();
    } catch (err) {
      console.error('[SongLibrary] Failed to delete song:', err);
    } finally {
      setDeletingId(null);
    }
  };

  const formatDuration = (seconds: number): string => {
    if (!seconds || seconds <= 0) return '0:00';
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const formatSize = (bytes: number): string => {
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const timeAgo = (timestamp: number): string => {
    const diff = Date.now() - timestamp;
    const minutes = Math.floor(diff / 60000);
    if (minutes < 1) return 'Just now';
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    if (days < 7) return `${days}d ago`;
    return new Date(timestamp).toLocaleDateString();
  };

  return (
    <div className="card-glow overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-border-subtle">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-purple-500/10 border border-purple-500/20 flex items-center justify-center">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" className="text-purple-400" strokeWidth="1.5">
              <path d="M12 2L2 7l10 5 10-5-10-5z" />
              <path d="M2 17l10 5 10-5" />
              <path d="M2 12l10 5 10-5" />
            </svg>
          </div>
          <div>
            <h3 className="text-sm font-bold text-white">Song Library</h3>
            <p className="text-xs text-text-muted">
              {songCount} song{songCount !== 1 ? 's' : ''} saved
            </p>
          </div>
        </div>
        <button
          onClick={onClose}
          className="text-text-muted hover:text-white transition-colors p-1"
          aria-label="Close library"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>

      {/* Search */}
      <div className="px-4 pt-3 pb-2">
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search songs..."
          className="w-full px-3 py-2 bg-bg-input border border-border-subtle rounded-lg text-sm text-white placeholder:text-text-muted focus:border-purple-400 focus:outline-none"
        />
      </div>

      {/* Song List */}
      <div className="max-h-80 overflow-y-auto px-4 pb-4">
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <div className="w-5 h-5 border-2 border-purple-400 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : songs.length === 0 ? (
          <div className="text-center py-8">
            <p className="text-sm text-text-muted">
              {searchQuery ? 'No songs match your search' : 'No songs saved yet'}
            </p>
            <p className="text-xs text-text-muted mt-1">
              {!searchQuery && 'Upload or rip a song, then save it to your library'}
            </p>
          </div>
        ) : (
          <div className="space-y-1.5 mt-1">
            {songs.map((song) => (
              <div
                key={song.id}
                className="group flex items-center gap-3 p-2.5 rounded-lg hover:bg-white/5 transition-colors"
              >
                {/* Preview button */}
                <button
                  onClick={() => handlePreview(song)}
                  className="w-9 h-9 rounded-full bg-white/5 border border-border-subtle flex items-center justify-center flex-shrink-0 hover:bg-purple-500/20 hover:border-purple-500/30 transition-colors"
                  aria-label={playingId === song.id ? 'Stop preview' : 'Preview'}
                >
                  {playingId === song.id ? (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" className="text-purple-400">
                      <rect x="6" y="4" width="4" height="16" />
                      <rect x="14" y="4" width="4" height="16" />
                    </svg>
                  ) : (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" className="text-white/60 ml-0.5">
                      <polygon points="5 3 19 12 5 21" />
                    </svg>
                  )}
                </button>

                {/* Song info */}
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-white font-medium truncate">{song.name}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-xs text-text-muted font-mono">
                      {formatDuration(song.duration)}
                    </span>
                    <span className="text-[10px] text-text-muted">{formatSize(song.size)}</span>
                    <span
                      className={`text-[10px] px-1.5 py-0.5 rounded-full ${
                        song.source === 'youtube'
                          ? 'bg-red-500/10 text-red-400'
                          : 'bg-blue-500/10 text-blue-400'
                      }`}
                    >
                      {song.source}
                    </span>
                    <span className="text-[10px] text-text-muted">{timeAgo(song.dateAdded)}</span>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={() => handleSelect(song)}
                    disabled={loadingId === song.id}
                    className="px-3 py-1.5 rounded-md bg-purple-500/20 text-purple-400 text-xs font-semibold hover:bg-purple-500/30 transition-colors disabled:opacity-50"
                  >
                    {loadingId === song.id ? (
                      <div className="w-3 h-3 border-2 border-purple-400 border-t-transparent rounded-full animate-spin" />
                    ) : (
                      'Use'
                    )}
                  </button>
                  <button
                    onClick={() => handleDelete(song.id)}
                    disabled={deletingId === song.id}
                    className="p-1.5 rounded-md text-text-muted hover:text-red-400 hover:bg-red-500/10 transition-colors disabled:opacity-50"
                    aria-label="Delete song"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <polyline points="3 6 5 6 21 6" />
                      <path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
                    </svg>
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
