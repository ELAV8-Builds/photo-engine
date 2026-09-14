'use client';

/**
 * StorageCard — Phase 6. What PhotoForge's cache holds, per artefact class,
 * and one click to reclaim what is orphaned (artefacts of items, moments or
 * shot lists that no longer exist). Everything here is regenerable cache;
 * the user's media is never touched.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ArtifactClass, StorageReport } from '@/types/library';
import { libraryApi, LibraryApiError } from '@/lib/library-client';
import { formatBytes } from '@/lib/db';

interface StorageCardProps {
  /** Shown so the user knows exactly which folder this is (their own machine). */
  appDataDir?: string;
  onNotice: (message: string) => void;
  onError: (message: string) => void;
}

const CLASS_META: Record<ArtifactClass, { label: string; detail: string; bar: string }> = {
  previews360: { label: '360° previews', detail: 'flat 720p previews of whole clips', bar: 'bg-accent-gold/60' },
  highlightClips: { label: 'Highlight clips', detail: 'flat, panning and tiny-planet moments', bar: 'bg-accent-gold/35' },
  thumbnails: { label: 'Thumbnails', detail: 'grid and moment thumbnails', bar: 'bg-accent-gold/20' },
  renditions: { label: 'Photo renditions', detail: 'resized copies for the renderer', bar: 'bg-accent-honey/25' },
  viewFrames: { label: 'Reframe previews', detail: 'frames the yaw editor showed', bar: 'bg-accent-gold/10' },
  analysis: { label: 'Analysis', detail: 'signals, curation records, remembered views', bar: 'bg-bg-elevated' },
  storyPlans: { label: 'Story plans', detail: 'one per shot list', bar: 'bg-border-subtle' },
};

/** Display order: biggest classes first so the bar reads left to right. */
const CLASS_ORDER: ArtifactClass[] = ['previews360', 'highlightClips', 'thumbnails', 'renditions', 'viewFrames', 'analysis', 'storyPlans'];

function errorText(err: unknown): string {
  if (err instanceof LibraryApiError || err instanceof Error) return err.message;
  return 'Something went wrong';
}

export default function StorageCard({ appDataDir, onNotice, onError }: StorageCardProps) {
  const [report, setReport] = useState<StorageReport | null>(null);
  const [busy, setBusy] = useState<'load' | 'clear' | null>('load');

  const refresh = useCallback(async () => {
    setBusy('load');
    try {
      setReport(await libraryApi.storage());
    } catch (err) {
      onError(errorText(err));
    } finally {
      setBusy(null);
    }
  }, [onError]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const clear = useCallback(async () => {
    setBusy('clear');
    try {
      const { removedFiles, removedBytes, report: fresh } = await libraryApi.clearOrphans();
      setReport(fresh);
      onNotice(removedFiles === 0 ? 'Nothing to clear — no orphaned artefacts.' : `Cleared ${removedFiles} orphaned file${removedFiles === 1 ? '' : 's'} (${formatBytes(removedBytes)}).`);
    } catch (err) {
      onError(errorText(err));
    } finally {
      setBusy(null);
    }
  }, [onNotice, onError]);

  const rows = useMemo(() => {
    if (!report) return [];
    const byClass = new Map(report.classes.map((c) => [c.class, c]));
    return CLASS_ORDER.map((cls) => byClass.get(cls)).filter((c): c is NonNullable<typeof c> => !!c && c.files > 0);
  }, [report]);

  const hasOrphans = !!report && report.orphanFiles > 0;

  return (
    <section className="card-glow p-5 sm:p-6 space-y-4" aria-labelledby="storage-heading" aria-busy={busy !== null}>
      <div>
        <div className="flex items-baseline justify-between gap-4">
          <h2 id="storage-heading" className="text-white font-semibold text-base">
            Storage
          </h2>
          <p className="text-right shrink-0 leading-none">
            <span className="text-xl sm:text-2xl font-mono tabular-nums text-white">{report ? formatBytes(report.totalBytes) : '—'}</span>
            <span className="block text-[11px] text-text-muted mt-1">{report ? `${report.totalFiles} files` : 'measuring…'}</span>
          </p>
        </div>
        <p className="text-text-muted text-sm mt-1">
          Previews, clips and analysis PhotoForge made from your library. All of it is regenerable cache — your media is never touched.
        </p>
        {appDataDir && (
          <p className="text-[11px] font-mono text-text-muted mt-2 truncate" title={appDataDir}>
            {appDataDir}
          </p>
        )}
      </div>

      {/* Share of the cache per class, biggest first. */}
      <div className="h-2 rounded-full overflow-hidden bg-bg-input flex" role="img" aria-label={report ? 'Cache share per artefact class' : 'Measuring cache'}>
        {report && report.totalBytes > 0 ? (
          rows.map((c) => (
            <div key={c.class} className={`${CLASS_META[c.class].bar} h-full`} style={{ width: `${Math.max(0.5, (c.bytes / report.totalBytes) * 100)}%` }} />
          ))
        ) : (
          <div className="skeleton w-full h-full" />
        )}
      </div>

      {report && rows.length === 0 ? (
        <p className="text-sm text-text-muted">Nothing cached yet. Add a library folder and the cache fills in as files are prepared.</p>
      ) : (
        <ul className="divide-y divide-border-subtle/60" aria-label="Cache by artefact class">
          {(report ? rows : CLASS_ORDER.slice(0, 4).map((cls) => ({ class: cls, files: 0, bytes: 0, orphanFiles: 0, orphanBytes: 0 }))).map((c) => {
            const meta = CLASS_META[c.class];
            return (
              <li key={c.class} className="grid grid-cols-[1fr_auto] sm:grid-cols-[1fr_5.5rem_6rem_8rem] items-baseline gap-x-4 py-2">
                <div className="min-w-0 flex items-baseline gap-2">
                  <span className={`w-2 h-2 rounded-full shrink-0 ${meta.bar}`} aria-hidden="true" />
                  <div className="min-w-0">
                    <span className="block text-sm text-white truncate">{meta.label}</span>
                    <span className="block text-[11px] text-text-muted truncate">{meta.detail}</span>
                  </div>
                </div>
                <span className="hidden sm:block text-xs font-mono tabular-nums text-text-muted text-right">{report ? `${c.files} file${c.files === 1 ? '' : 's'}` : ''}</span>
                <span className="text-sm font-mono tabular-nums text-text-secondary text-right">
                  {report ? formatBytes(c.bytes) : <span className="skeleton inline-block w-14 h-3 align-middle" />}
                  {report && c.orphanFiles > 0 && <span className="block sm:hidden text-[11px] text-accent-amber">{formatBytes(c.orphanBytes)} orphaned</span>}
                </span>
                <span className={`hidden sm:block text-xs font-mono tabular-nums text-right ${c.orphanFiles > 0 ? 'text-accent-amber' : 'text-text-muted'}`}>
                  {report ? (c.orphanFiles > 0 ? `${formatBytes(c.orphanBytes)} orphaned` : '—') : ''}
                </span>
              </li>
            );
          })}
        </ul>
      )}

      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 pt-1">
        {hasOrphans ? (
          <button type="button" onClick={clear} disabled={busy !== null} className="btn-gold !py-2 !px-4 !rounded-full text-sm" aria-describedby="storage-orphans-note">
            {busy === 'clear' ? 'Clearing…' : `Clear ${report.orphanFiles} orphaned file${report.orphanFiles === 1 ? '' : 's'} · ${formatBytes(report.orphanBytes)}`}
          </button>
        ) : (
          <span className="text-sm text-text-secondary" role="status">
            {report ? 'Nothing orphaned' : 'Measuring…'}
          </span>
        )}
        <button type="button" onClick={refresh} disabled={busy !== null} className="btn-outline !py-2 !px-4 !rounded-full text-sm disabled:opacity-40 disabled:cursor-not-allowed">
          {busy === 'load' ? 'Measuring…' : 'Refresh'}
        </button>
        <p id="storage-orphans-note" className="text-[11px] text-text-muted basis-full lg:basis-auto lg:ml-auto lg:text-right">
          Orphans are left behind when files change or move, a folder is removed, or moments are re-chosen.
          {report && report.unrecognisedFiles > 0 && (
            <span className="block text-accent-amber">
              {report.unrecognisedFiles} unrecognised file{report.unrecognisedFiles === 1 ? '' : 's'} ({formatBytes(report.unrecognisedBytes)}) left alone.
            </span>
          )}
        </p>
      </div>
    </section>
  );
}
