'use client';

import { useState } from 'react';
import { type ProjectSummary } from '@/lib/project-manager';
import { SMART_TEMPLATES } from '@/lib/templates';

interface ProjectCardProps {
  project: ProjectSummary;
  onLoad: (id: string) => void;
  onDelete: (id: string) => void;
  onDuplicate: (id: string) => void;
  onRename: (id: string, newName: string) => void;
}

export default function ProjectCard({
  project,
  onLoad,
  onDelete,
  onDuplicate,
  onRename,
}: ProjectCardProps) {
  const [showMenu, setShowMenu] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState(project.name);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const template = project.templateId
    ? SMART_TEMPLATES.find((t) => t.id === project.templateId)
    : null;

  const formatDate = (ts: number) => {
    const d = new Date(ts);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays === 0) {
      return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
    }
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return `${diffDays}d ago`;
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  };

  const formatDuration = (seconds: number): string => {
    if (!seconds || seconds <= 0) return '0:00';
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const handleRename = () => {
    if (editName.trim() && editName.trim() !== project.name) {
      onRename(project.id, editName.trim());
    }
    setEditing(false);
  };

  return (
    <div className="card-glow group relative overflow-hidden transition-all hover:shadow-gold-sm">
      {/* Thumbnail */}
      <div
        className="aspect-video bg-bg-input relative cursor-pointer overflow-hidden"
        onClick={() => onLoad(project.id)}
      >
        {project.thumbnailUrl ? (
          <img
            src={project.thumbnailUrl}
            alt={project.name}
            className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" className="text-text-muted/40" strokeWidth="1">
              <rect x="3" y="3" width="18" height="18" rx="2" />
              <circle cx="9" cy="9" r="2" />
              <path d="M21 15l-3.086-3.086a2 2 0 00-2.828 0L6 21" />
            </svg>
          </div>
        )}

        {/* Overlay badges */}
        <div className="absolute top-2 left-2 flex items-center gap-1.5">
          {project.aspectRatio !== '16:9' && (
            <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-black/60 text-white/80 backdrop-blur-sm">
              {project.aspectRatio}
            </span>
          )}
          <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-black/60 text-white/80 backdrop-blur-sm">
            {formatDuration(project.totalDuration)}
          </span>
        </div>

        {/* Media count badge */}
        <div className="absolute top-2 right-2">
          <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-black/60 text-white/80 backdrop-blur-sm">
            {project.mediaCount} item{project.mediaCount !== 1 ? 's' : ''}
          </span>
        </div>

        {/* Hover overlay */}
        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
          <span className="px-4 py-2 rounded-lg bg-accent-gold text-bg-main text-xs font-bold">
            Open Project
          </span>
        </div>
      </div>

      {/* Info */}
      <div className="p-3">
        <div className="flex items-center justify-between gap-2">
          {editing ? (
            <input
              type="text"
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              onBlur={handleRename}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleRename();
                if (e.key === 'Escape') { setEditing(false); setEditName(project.name); }
              }}
              className="flex-1 px-2 py-0.5 bg-bg-input border border-accent-gold/30 rounded text-sm text-white focus:outline-none"
              autoFocus
            />
          ) : (
            <p className="text-sm text-white font-semibold truncate flex-1">{project.name}</p>
          )}

          {/* Menu button */}
          <div className="relative">
            <button
              onClick={(e) => { e.stopPropagation(); setShowMenu(!showMenu); }}
              className="p-1 text-text-muted hover:text-white transition-colors rounded opacity-0 group-hover:opacity-100"
              aria-label="Project options"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                <circle cx="12" cy="5" r="2" />
                <circle cx="12" cy="12" r="2" />
                <circle cx="12" cy="19" r="2" />
              </svg>
            </button>

            {/* Dropdown menu */}
            {showMenu && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => { setShowMenu(false); setConfirmDelete(false); }} />
                <div className="absolute right-0 top-full mt-1 w-40 bg-bg-card border border-border-subtle rounded-lg shadow-xl z-20 py-1 overflow-hidden">
                  <button
                    onClick={() => { onLoad(project.id); setShowMenu(false); }}
                    className="w-full text-left px-3 py-2 text-xs text-white hover:bg-white/5 transition-colors flex items-center gap-2"
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M5 12h14M12 5l7 7-7 7" />
                    </svg>
                    Open
                  </button>
                  <button
                    onClick={() => { setEditing(true); setShowMenu(false); }}
                    className="w-full text-left px-3 py-2 text-xs text-white hover:bg-white/5 transition-colors flex items-center gap-2"
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" />
                      <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
                    </svg>
                    Rename
                  </button>
                  <button
                    onClick={() => { onDuplicate(project.id); setShowMenu(false); }}
                    className="w-full text-left px-3 py-2 text-xs text-white hover:bg-white/5 transition-colors flex items-center gap-2"
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <rect x="9" y="9" width="13" height="13" rx="2" />
                      <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
                    </svg>
                    Duplicate
                  </button>
                  <div className="border-t border-border-subtle my-1" />
                  {confirmDelete ? (
                    <button
                      onClick={() => { onDelete(project.id); setShowMenu(false); setConfirmDelete(false); }}
                      className="w-full text-left px-3 py-2 text-xs text-red-400 bg-red-500/10 hover:bg-red-500/20 transition-colors flex items-center gap-2"
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <polyline points="3 6 5 6 21 6" />
                        <path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
                      </svg>
                      Confirm Delete
                    </button>
                  ) : (
                    <button
                      onClick={() => setConfirmDelete(true)}
                      className="w-full text-left px-3 py-2 text-xs text-red-400 hover:bg-red-500/10 transition-colors flex items-center gap-2"
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <polyline points="3 6 5 6 21 6" />
                        <path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
                      </svg>
                      Delete
                    </button>
                  )}
                </div>
              </>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 mt-1.5">
          {template && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-accent-gold/10 text-accent-gold/70">
              {template.emoji} {template.name}
            </span>
          )}
          <span className="text-[10px] text-text-muted ml-auto">{formatDate(project.updatedAt)}</span>
        </div>
      </div>
    </div>
  );
}
