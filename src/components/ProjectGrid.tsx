'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  getAllProjectSummaries,
  searchProjects,
  deleteProject,
  duplicateProject,
  renameProject,
  getProjectCount,
  type ProjectSummary,
} from '@/lib/project-manager';
import { getStorageEstimate, formatBytes } from '@/lib/db';
import ProjectCard from './ProjectCard';

interface ProjectGridProps {
  onLoadProject: (id: string) => void;
}

export default function ProjectGrid({ onLoadProject }: ProjectGridProps) {
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [projectCount, setProjectCount] = useState(0);
  const [storage, setStorage] = useState({ used: 0, quota: 0, percent: 0 });

  const loadProjects = useCallback(async () => {
    setLoading(true);
    try {
      const results = searchQuery
        ? await searchProjects(searchQuery)
        : await getAllProjectSummaries();
      setProjects(results);
      const count = await getProjectCount();
      setProjectCount(count);
      const storageEstimate = await getStorageEstimate();
      setStorage(storageEstimate);
    } catch (err) {
      console.error('[ProjectGrid] Failed to load projects:', err);
    } finally {
      setLoading(false);
    }
  }, [searchQuery]);

  useEffect(() => {
    loadProjects();
  }, [loadProjects]);

  const handleDelete = async (id: string) => {
    try {
      await deleteProject(id);
      await loadProjects();
    } catch (err) {
      console.error('[ProjectGrid] Delete failed:', err);
    }
  };

  const handleDuplicate = async (id: string) => {
    try {
      await duplicateProject(id);
      await loadProjects();
    } catch (err) {
      console.error('[ProjectGrid] Duplicate failed:', err);
    }
  };

  const handleRename = async (id: string, newName: string) => {
    try {
      await renameProject(id, newName);
      await loadProjects();
    } catch (err) {
      console.error('[ProjectGrid] Rename failed:', err);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-white">My Projects</h2>
          <p className="text-sm text-text-muted">
            {projectCount} project{projectCount !== 1 ? 's' : ''}
            {storage.used > 0 && (
              <span className="text-text-muted">
                {' '}&bull; {formatBytes(storage.used)} used
                {storage.percent > 0 && ` (${storage.percent}%)`}
              </span>
            )}
          </p>
        </div>
      </div>

      {/* Search */}
      {projectCount > 3 && (
        <div className="relative">
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted"
            strokeWidth="2"
          >
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search projects..."
            className="w-full pl-10 pr-4 py-2.5 bg-bg-input border border-border-subtle rounded-lg text-sm text-white placeholder:text-text-muted focus:border-accent-gold focus:outline-none"
          />
        </div>
      )}

      {/* Grid */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <div className="w-6 h-6 border-2 border-accent-gold border-t-transparent rounded-full animate-spin" />
        </div>
      ) : projects.length === 0 ? (
        <div className="text-center py-16">
          <div className="w-16 h-16 mx-auto mb-4 rounded-xl bg-white/5 border border-border-subtle flex items-center justify-center">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" className="text-text-muted/50" strokeWidth="1.5">
              <path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z" />
            </svg>
          </div>
          <p className="text-sm text-text-muted">
            {searchQuery ? 'No projects match your search' : 'No projects saved yet'}
          </p>
          <p className="text-xs text-text-muted mt-1">
            {!searchQuery && 'Create a presentation and save it to see it here'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {projects.map((project) => (
            <ProjectCard
              key={project.id}
              project={project}
              onLoad={onLoadProject}
              onDelete={handleDelete}
              onDuplicate={handleDuplicate}
              onRename={handleRename}
            />
          ))}
        </div>
      )}

      {/* Storage warning */}
      {storage.percent > 80 && (
        <div className="flex items-center gap-3 p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/20">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" className="text-yellow-400 flex-shrink-0" strokeWidth="2">
            <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
            <line x1="12" y1="9" x2="12" y2="13" />
            <line x1="12" y1="17" x2="12.01" y2="17" />
          </svg>
          <p className="text-xs text-yellow-400">
            Storage is {storage.percent}% full ({formatBytes(storage.used)} / {formatBytes(storage.quota)}).
            Consider deleting old projects to free space.
          </p>
        </div>
      )}
    </div>
  );
}
