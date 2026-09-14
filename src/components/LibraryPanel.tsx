'use client';

/**
 * LibraryPanel — register whole folders, watch them index in the background,
 * and add any ready items to the current project.
 *
 * All heavy work happens on the local server; this component only polls status
 * and renders. Files never leave the machine.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { FaceRegion, MediaFile } from '@/types';
import type { LibraryItem, LibraryRoot, QueueSnapshot, SystemCapabilities } from '@/types/library';
import {
  describeJob,
  isItemUsable,
  libraryApi,
  LibraryApiError,
  libraryItemToMediaFile,
  libraryMediaId,
  mediaUrl,
  montagePickToMediaFile,
  pickKey,
} from '@/lib/library-client';
import { detectFaces } from '@/lib/face-detect';
import { cloudProviderActive, loadProviderSettings } from '@/lib/provider-settings';

interface LibraryPanelProps {
  /** Library item ids with at least one entry in the project (whole item or a highlight). */
  inProjectIds: ReadonlySet<string>;
  /** Project media ids (`lib-<id>` / `lib-<id>-hl<n>`), so picks are never duplicated. */
  inProjectMediaIds: ReadonlySet<string>;
  /** Slot count of the chosen template, or a sensible default. */
  suggestedPickCount: number;
  onAddMedia: (items: MediaFile[]) => void;
}

type KindFilter = 'all' | 'photo' | 'video';
type SortMode = 'time' | 'score';

const POLL_ACTIVE_MS = 2000;
const POLL_IDLE_MS = 8000;

export default function LibraryPanel({ inProjectIds, inProjectMediaIds, suggestedPickCount, onAddMedia }: LibraryPanelProps) {
  const [caps, setCaps] = useState<SystemCapabilities | null>(null);
  const [roots, setRoots] = useState<LibraryRoot[]>([]);
  const [items, setItems] = useState<LibraryItem[]>([]);
  const [jobs, setJobs] = useState<QueueSnapshot | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState<KindFilter>('all');
  const [sort, setSort] = useState<SortMode>('time');
  const [pickCount, setPickCount] = useState(suggestedPickCount);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<'pick' | 'add' | 'adding' | 'photos' | 'analyse' | 'autopick' | null>(null);
  const [showPathInput, setShowPathInput] = useState(false);
  const [manualPath, setManualPath] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [pollTick, setPollTick] = useState(0);
  const [cloudAi, setCloudAi] = useState(false);
  const wasActive = useRef(false);
  const pollFailed = useRef(false);

  const isActive = !!jobs && (jobs.queued > 0 || jobs.running.length > 0);
  // Cloud provider needs no local model; otherwise Ollama + the configured model must be up.
  const aiReady = cloudAi || !!caps?.ollama?.modelAvailable;

  // Follow the template's slot count until the user types their own number.
  const pickCountTouched = useRef(false);
  useEffect(() => {
    if (!pickCountTouched.current) setPickCount(suggestedPickCount);
  }, [suggestedPickCount]);

  // ---- data loading ---------------------------------------------------------

  const refreshRootsAndItems = useCallback(async () => {
    const [r, page] = await Promise.all([libraryApi.roots(), libraryApi.items({ limit: 2000 })]);
    setRoots(r);
    setItems(page.items);
  }, []);

  const refreshJobs = useCallback(async () => {
    setJobs(await libraryApi.jobs());
  }, []);

  const refreshCaps = useCallback(async () => {
    setCaps(await libraryApi.capabilities());
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [, , , provider] = await Promise.all([refreshCaps(), refreshRootsAndItems(), refreshJobs(), loadProviderSettings()]);
        if (!cancelled) setCloudAi(cloudProviderActive(provider));
      } catch (err) {
        if (!cancelled) setError(errorText(err));
      } finally {
        if (!cancelled) setLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [refreshCaps, refreshRootsAndItems, refreshJobs]);

  // Poll faster while the server is busy; refresh items as thumbnails land.
  // The loop must survive transient failures (e.g. the local server restarting),
  // so every tick schedules the next one regardless of outcome.
  useEffect(() => {
    if (!loaded) return;
    const delay = isActive ? POLL_ACTIVE_MS : POLL_IDLE_MS;
    const timer = setTimeout(async () => {
      try {
        await refreshJobs();
        // Recovering from an outage: reload everything and clear the stale error.
        if (isActive || wasActive.current || pollFailed.current) await refreshRootsAndItems();
        if (pollFailed.current) {
          pollFailed.current = false;
          setError(null);
        }
        // Ollama may be started while the app is open; re-check about every 30 s until it is ready.
        if (!aiReady && pollTick % 4 === 3) await refreshCaps();
        wasActive.current = isActive;
      } catch (err) {
        pollFailed.current = true;
        setError(errorText(err));
      } finally {
        setPollTick((t) => t + 1);
      }
    }, delay);
    return () => clearTimeout(timer);
  }, [loaded, isActive, pollTick, aiReady, refreshJobs, refreshRootsAndItems, refreshCaps]);

  // ---- root actions ---------------------------------------------------------

  const addRootPath = useCallback(
    async (path: string) => {
      setError(null);
      try {
        await libraryApi.addRoot(path);
        setManualPath('');
        setShowPathInput(false);
        await Promise.all([refreshRootsAndItems(), refreshJobs()]);
      } catch (err) {
        setError(errorText(err));
      }
    },
    [refreshRootsAndItems, refreshJobs],
  );

  const pickFolder = useCallback(async () => {
    setBusy('pick');
    setError(null);
    try {
      const path = await libraryApi.pickFolder();
      if (path) await addRootPath(path);
    } catch (err) {
      // Picker unavailable — fall back to typing a path.
      if (err instanceof LibraryApiError && err.status === 501) setShowPathInput(true);
      else setError(errorText(err));
    } finally {
      setBusy(null);
    }
  }, [addRootPath]);

  const removeRoot = useCallback(
    async (root: LibraryRoot) => {
      if (!window.confirm(`Remove "${root.label}" from your library?\n\nPhotoForge will forget this folder. No files are deleted.`)) return;
      setError(null);
      try {
        await libraryApi.removeRoot(root.id);
        setSelected(new Set());
        await Promise.all([refreshRootsAndItems(), refreshJobs()]);
      } catch (err) {
        setError(errorText(err));
      }
    },
    [refreshRootsAndItems, refreshJobs],
  );

  const rescan = useCallback(
    async (root: LibraryRoot) => {
      setError(null);
      try {
        await libraryApi.rescanRoot(root.id);
        await refreshJobs();
      } catch (err) {
        setError(errorText(err));
      }
    },
    [refreshJobs],
  );

  const togglePause = useCallback(async () => {
    if (!jobs) return;
    try {
      setJobs(jobs.paused ? await libraryApi.resumeJobs() : await libraryApi.pauseJobs());
    } catch (err) {
      setError(errorText(err));
    }
  }, [jobs]);

  const addPhotosLibrary = useCallback(async () => {
    setBusy('photos');
    setError(null);
    try {
      await libraryApi.addPhotosLibrary();
      await Promise.all([refreshCaps(), refreshRootsAndItems(), refreshJobs()]);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(null);
    }
  }, [refreshCaps, refreshRootsAndItems, refreshJobs]);

  // ---- curation -------------------------------------------------------------

  const analyse = useCallback(
    async (itemIds?: string[], force = false) => {
      setBusy('analyse');
      setError(null);
      setNotice(null);
      try {
        const { enqueued, skipped } = await libraryApi.analyse({ itemIds, force });
        setNotice(enqueued > 0 ? `Queued ${enqueued} item${enqueued === 1 ? '' : 's'} for local analysis.` : skipped > 0 ? 'Everything here is already analysed.' : 'Nothing to analyse yet.');
        await Promise.all([refreshJobs(), refreshRootsAndItems()]);
      } catch (err) {
        setError(errorText(err));
      } finally {
        setBusy(null);
      }
    },
    [refreshJobs, refreshRootsAndItems],
  );

  // ---- selection & add ------------------------------------------------------

  const visibleItems = useMemo(() => {
    const list = filter === 'all' ? items : items.filter((i) => i.kind === filter);
    if (sort === 'time') return list;
    return [...list].sort((a, b) => (b.curation?.score ?? -1) - (a.curation?.score ?? -1) || (a.capturedAt ?? a.mtimeMs) - (b.capturedAt ?? b.mtimeMs));
  }, [items, filter, sort]);

  const readyVisible = useMemo(
    () => visibleItems.filter((i) => isItemUsable(i).usable && !inProjectMediaIds.has(libraryMediaId(i.id))),
    [visibleItems, inProjectMediaIds],
  );

  const analysedCount = useMemo(() => items.filter((i) => i.status.curate === 'ready').length, [items]);

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAllReady = () => setSelected(new Set(readyVisible.map((i) => i.id)));
  const clearSelection = () => setSelected(new Set());

  const addSelected = useCallback(async () => {
    const chosen = items.filter((i) => selected.has(i.id) && isItemUsable(i).usable && !inProjectMediaIds.has(libraryMediaId(i.id)));
    if (chosen.length === 0) return;
    setBusy('adding');
    setError(null);
    try {
      const mediaFiles: MediaFile[] = [];
      for (let i = 0; i < chosen.length; i++) {
        const item = chosen[i];
        const media = libraryItemToMediaFile(item, i);
        media.faces = await detectFacesScaled(mediaUrl.thumb(item.id), media.width, media.height);
        mediaFiles.push(media);
      }
      onAddMedia(mediaFiles);
      setSelected(new Set());
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(null);
    }
  }, [items, selected, inProjectMediaIds, onAddMedia]);

  /** Ask the server for the best N (photos + video highlight windows) and add them as project media. */
  const autoPick = useCallback(async () => {
    const slots = Math.max(1, Math.min(200, Math.round(pickCount)));
    setBusy('autopick');
    setError(null);
    setNotice(null);
    try {
      const exclude: string[] = [];
      inProjectMediaIds.forEach((mediaId) => {
        const m = /^lib-([a-f0-9]{20})(?:-hl(\d+))?$/.exec(mediaId);
        if (m) exclude.push(pickKey(m[1], m[2] === undefined ? undefined : Number(m[2])));
      });
      const { picks, considered } = await libraryApi.select({ slots, exclude });
      if (picks.length === 0) {
        setNotice(considered === 0 ? 'Nothing has been analysed yet — run Analyse library first.' : 'No new moments to add; everything suitable is already in the project.');
        return;
      }
      const byId = new Map(items.map((i) => [i.id, i]));
      const mediaFiles: MediaFile[] = [];
      for (let i = 0; i < picks.length; i++) {
        const item = byId.get(picks[i].itemId);
        if (!item) continue;
        const media = montagePickToMediaFile(picks[i], item, i);
        // Detect on the highlight's own frame when it exists; the generic thumbnail may show a different view.
        media.faces = await detectFacesScaled(media.thumbnailUrl ?? mediaUrl.thumb(item.id), media.width, media.height);
        mediaFiles.push(media);
      }
      onAddMedia(mediaFiles);
      const videos = mediaFiles.filter((m) => m.type === 'video').length;
      setNotice(`Added ${mediaFiles.length} picks: ${mediaFiles.length - videos} photo${mediaFiles.length - videos === 1 ? '' : 's'}, ${videos} video moment${videos === 1 ? '' : 's'}.`);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(null);
    }
  }, [pickCount, inProjectMediaIds, items, onAddMedia]);

  // ---- render ---------------------------------------------------------------

  const toolingProblem = caps && (!caps.ffmpeg.found || !caps.ffprobe.found);
  const selectedCount = readyVisible.filter((i) => selected.has(i.id)).length;
  const selectedIds = useMemo(() => items.filter((i) => selected.has(i.id)).map((i) => i.id), [items, selected]);
  const ollama = caps?.ollama;
  const photosLib = caps?.photosLibrary;
  const runningLabel = jobs?.running[0] ? describeJob(jobs.running[0]) : null;
  const runningProgress = jobs?.running[0]?.progress;
  const totalWork = jobs ? jobs.queued + jobs.running.length : 0;
  // Progress across everything the server has handled since it started.
  const finished = jobs ? jobs.totals.done + jobs.totals.failed + jobs.totals.cancelled : 0;
  const sessionProgress = finished + totalWork > 0 ? (finished + (runningProgress ?? 0)) / (finished + totalWork) : 0;

  return (
    <section className="card-glow p-5 sm:p-6 space-y-5" aria-labelledby="library-heading">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="library-heading" className="text-white font-semibold text-base">
            Library folders
          </h2>
          <p className="text-text-muted text-sm mt-1">
            Index whole folders in the background and pick from everything. Files stay on this Mac.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {photosLib?.found && !photosLib.registeredRootId && (
            <button
              type="button"
              onClick={addPhotosLibrary}
              disabled={busy === 'photos' || !!toolingProblem}
              className="btn-outline !py-2 !px-4 !rounded-full text-sm disabled:opacity-40 disabled:cursor-not-allowed"
              title={photosLib.readable ? `Index your ${photosLib.label} in place — no copies are made` : 'macOS is protecting your Photos library; click for how to allow access'}
            >
              {busy === 'photos' ? 'Adding…' : `Add ${photosLib.label ?? 'Photos Library'}`}
            </button>
          )}
          <button
            type="button"
            onClick={pickFolder}
            disabled={busy === 'pick' || !!toolingProblem}
            className="btn-outline !py-2 !px-4 !rounded-full text-sm disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {busy === 'pick' ? 'Choose in dialog…' : 'Add folder…'}
          </button>
          <button
            type="button"
            onClick={() => setShowPathInput((v) => !v)}
            className="text-xs text-text-muted hover:text-white underline-offset-2 hover:underline px-1 py-2"
            aria-expanded={showPathInput}
          >
            {showPathInput ? 'Hide path field' : 'Type a path'}
          </button>
        </div>
      </div>

      {/* AI status */}
      {ollama && (
        <p className="flex items-center gap-2 text-xs text-text-muted" role="status">
          <span aria-hidden="true" className={`inline-block w-2 h-2 rounded-full ${aiReady ? 'bg-accent-gold' : 'bg-text-muted'}`} />
          {cloudAi ? (
            <>
              <span className="text-accent-gold">Cloud AI on</span> · Gemini grades frames and writes stories — 512-px frames and captions leave this Mac.{' '}
              <a href="/settings" className="underline underline-offset-2 hover:text-white">
                Settings
              </a>
            </>
          ) : aiReady ? (
            <>
              Local AI ready · <span className="font-mono text-text-secondary">{ollama.model}</span>
              {analysedCount > 0 && <span> · {analysedCount}/{items.length} analysed</span>}
            </>
          ) : ollama.running ? (
            <>
              Model <span className="font-mono">{ollama.model}</span> is not pulled — run <code className="font-mono text-text-secondary">ollama pull {ollama.model}</code>
            </>
          ) : (
            <>Ollama is not running — start it to analyse your library with local AI. Nothing leaves this Mac.</>
          )}
        </p>
      )}

      {/* Manual path entry */}
      {showPathInput && (
        <form
          className="flex flex-col sm:flex-row gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (manualPath.trim()) addRootPath(manualPath.trim());
          }}
        >
          <label className="sr-only" htmlFor="library-path">
            Folder path
          </label>
          <input
            id="library-path"
            value={manualPath}
            onChange={(e) => setManualPath(e.target.value)}
            placeholder="/Users/you/Pictures/Trip 2026"
            spellCheck={false}
            className="flex-1 bg-bg-input border border-border-subtle rounded-xl px-4 py-2 text-sm font-mono text-white placeholder:text-text-muted focus:border-border-gold outline-none"
          />
          <button type="submit" disabled={!manualPath.trim()} className="btn-gold !py-2 !px-4 !rounded-full text-sm">
            Add
          </button>
        </form>
      )}

      {/* Tooling problem */}
      {toolingProblem && (
        <p role="alert" className="text-sm text-red-400 bg-red-500/5 border border-red-500/30 rounded-xl px-4 py-3">
          ffmpeg/ffprobe were not found on this machine. Install them (for example <code className="font-mono">brew install ffmpeg</code>)
          and restart PhotoForge to use library folders.
        </p>
      )}

      {/* Error */}
      {error && (
        <div role="alert" className="flex items-start justify-between gap-3 text-sm text-red-400 bg-red-500/5 border border-red-500/30 rounded-xl px-4 py-3">
          <span className="min-w-0 break-words">{error}</span>
          <button type="button" onClick={() => setError(null)} className="text-text-muted hover:text-white shrink-0" aria-label="Dismiss error">
            ×
          </button>
        </div>
      )}

      {/* Notice */}
      {notice && (
        <div role="status" className="flex items-start justify-between gap-3 text-sm text-text-secondary bg-accent-gold/5 border border-border-gold rounded-xl px-4 py-3">
          <span className="min-w-0 break-words">{notice}</span>
          <button type="button" onClick={() => setNotice(null)} className="text-text-muted hover:text-white shrink-0" aria-label="Dismiss">
            ×
          </button>
        </div>
      )}

      {/* Roots */}
      {roots.length > 0 && (
        <ul className="space-y-2" aria-label="Registered folders">
          {roots.map((root) => (
            <li key={root.id} className="flex flex-wrap items-center justify-between gap-2 bg-bg-input/60 border border-border-subtle rounded-xl px-4 py-2.5">
              <div className="min-w-0">
                <p className="text-sm text-white font-medium truncate">{root.label}</p>
                <p className="text-[11px] text-text-muted font-mono truncate" title={root.path}>
                  {root.path}
                </p>
              </div>
              <div className="flex items-center gap-3 text-xs">
                <span className="text-text-secondary font-mono">{root.itemCount} items</span>
                <button type="button" onClick={() => rescan(root)} className="text-accent-gold hover:underline">
                  Rescan
                </button>
                <button type="button" onClick={() => removeRoot(root)} className="text-text-muted hover:text-red-400">
                  Remove
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {/* Background activity */}
      {jobs && (totalWork > 0 || jobs.paused || jobs.thermalPaused) && (
        <div role="status" aria-live="polite" className="space-y-2">
          <div className="flex items-center justify-between gap-3 text-xs">
            <p className="text-text-secondary truncate">
              {jobs.paused ? (
                <span className="text-accent-gold">Paused</span>
              ) : jobs.thermalPaused ? (
                <span className="text-accent-gold">Paused to keep the Mac cool — resumes automatically</span>
              ) : (
                <>
                  <span className="text-accent-gold">{runningLabel ?? 'Working'}</span>
                  {typeof runningProgress === 'number' && runningProgress > 0 && (
                    <span className="font-mono text-text-muted"> · {Math.round(runningProgress * 100)}%</span>
                  )}
                </>
              )}
              <span className="text-text-muted"> · {totalWork} task{totalWork === 1 ? '' : 's'} left</span>
            </p>
            <button type="button" onClick={togglePause} className="text-accent-gold hover:underline shrink-0">
              {jobs.paused ? 'Resume' : 'Pause'}
            </button>
          </div>
          <div className="progress-bar" aria-hidden="true">
            <div className="progress-bar-fill" style={{ width: `${Math.max(3, Math.round(sessionProgress * 100))}%` }} />
          </div>
        </div>
      )}

      {/* Empty state */}
      {loaded && roots.length === 0 && !toolingProblem && (
        <p className="text-sm text-text-muted border border-dashed border-border-subtle rounded-xl px-4 py-6 text-center">
          No library folders yet. Add one and PhotoForge will index it while you keep working.
        </p>
      )}

      {/* Items */}
      {items.length > 0 && (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-1" role="tablist" aria-label="Filter by type">
              {(['all', 'photo', 'video'] as KindFilter[]).map((k) => (
                <button
                  key={k}
                  type="button"
                  role="tab"
                  aria-selected={filter === k}
                  onClick={() => setFilter(k)}
                  className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                    filter === k ? 'bg-accent-gold text-bg-main' : 'text-text-secondary hover:text-white bg-bg-input'
                  }`}
                >
                  {k === 'all' ? `All ${items.length}` : k === 'photo' ? `Photos ${items.filter((i) => i.kind === 'photo').length}` : `Videos ${items.filter((i) => i.kind === 'video').length}`}
                </button>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <div className="flex items-center gap-1" role="group" aria-label="Sort by">
                {(['time', 'score'] as SortMode[]).map((s) => (
                  <button
                    key={s}
                    type="button"
                    aria-pressed={sort === s}
                    onClick={() => setSort(s)}
                    className={`px-3 py-1 rounded-full font-medium transition-colors ${
                      sort === s ? 'bg-bg-elevated text-white border border-border-gold' : 'text-text-muted hover:text-white border border-transparent'
                    }`}
                  >
                    {s === 'time' ? 'By time' : 'By score'}
                  </button>
                ))}
              </div>
              <span className="flex items-center gap-2 whitespace-nowrap">
                <button type="button" onClick={selectAllReady} className="text-accent-gold hover:underline" disabled={readyVisible.length === 0}>
                  Select all ready
                </button>
                <span className="text-border-subtle">|</span>
                <button type="button" onClick={clearSelection} className="text-text-muted hover:text-white" disabled={selected.size === 0}>
                  Clear
                </button>
              </span>
            </div>
          </div>

          {/* Local AI actions */}
          <div className="flex flex-wrap items-center justify-between gap-3 bg-bg-input/60 border border-border-subtle rounded-xl px-4 py-3">
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => analyse()}
                disabled={!aiReady || busy === 'analyse'}
                className="btn-outline !py-1.5 !px-4 !rounded-full text-xs disabled:opacity-40 disabled:cursor-not-allowed"
                title={aiReady ? 'Grade every item that has not been analysed yet' : 'Start Ollama to enable local analysis'}
              >
                {busy === 'analyse' ? 'Queuing…' : 'Analyse library'}
              </button>
              {selectedIds.length > 0 && (
                <button
                  type="button"
                  onClick={() => analyse(selectedIds, true)}
                  disabled={!aiReady || busy === 'analyse'}
                  className="text-xs text-accent-gold hover:underline disabled:opacity-40"
                >
                  Re-analyse {selectedIds.length} selected
                </button>
              )}
            </div>
            <form
              className="flex flex-wrap items-center gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                if (!busy) autoPick();
              }}
            >
              <label htmlFor="library-pick-count" className="text-xs text-text-secondary whitespace-nowrap">
                Auto-pick best
              </label>
              <input
                id="library-pick-count"
                type="number"
                min={1}
                max={200}
                value={pickCount}
                onChange={(e) => {
                  pickCountTouched.current = true;
                  setPickCount(Number(e.target.value));
                }}
                className="w-16 bg-bg-input border border-border-subtle rounded-full px-3 py-1 text-xs font-mono text-white text-center focus:border-border-gold outline-none"
              />
              <button
                type="submit"
                disabled={analysedCount === 0 || busy === 'autopick' || !Number.isFinite(pickCount) || pickCount < 1}
                className="btn-gold !py-1.5 !px-4 !rounded-full text-xs whitespace-nowrap"
                title={analysedCount === 0 ? 'Analyse the library first' : 'Add the best photos and video moments to the project'}
              >
                {busy === 'autopick' ? 'Picking…' : 'Add to project'}
              </button>
            </form>
          </div>

          <ul className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-2 sm:gap-3" aria-label="Library items">
            {visibleItems.map((item) => (
              <LibraryTile
                key={item.id}
                item={item}
                selected={selected.has(item.id)}
                inProject={inProjectIds.has(item.id)}
                wholeInProject={inProjectMediaIds.has(libraryMediaId(item.id))}
                onToggle={() => toggle(item.id)}
              />
            ))}
          </ul>

          <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
            <p className="text-sm text-text-secondary">
              <span className="text-accent-gold font-bold">{selectedCount}</span> selected · {readyVisible.length} ready to add
            </p>
            <button
              type="button"
              onClick={addSelected}
              disabled={selectedCount === 0 || busy === 'adding'}
              className="btn-gold !rounded-full inline-flex items-center gap-2"
            >
              {busy === 'adding' ? 'Adding…' : `Add ${selectedCount || ''} to project`.replace('  ', ' ')}
            </button>
          </div>
        </>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Tile
// ---------------------------------------------------------------------------

function LibraryTile({
  item,
  selected,
  inProject,
  wholeInProject,
  onToggle,
}: {
  item: LibraryItem;
  selected: boolean;
  /** Any entry from this item (whole or a highlight) is in the project. */
  inProject: boolean;
  /** The whole item is in the project, so it cannot be added again. */
  wholeInProject: boolean;
  onToggle: () => void;
}) {
  const usable = isItemUsable(item);
  const thumbReady = item.status.thumb === 'ready';
  const disabled = !usable.usable || wholeInProject;
  const analysing = item.status.curate === 'processing';
  const score = item.curation?.score;
  const label = `${item.name}${wholeInProject ? ' (already in project)' : usable.reason ? ` (${usable.reason})` : ''}${
    score !== undefined ? `, score ${(score * 10).toFixed(1)}` : ''
  }${item.kind === 'video' && item.curation ? `, ${item.curation.highlightCount} usable moment${item.curation.highlightCount === 1 ? '' : 's'}` : ''}${
    item.curation?.caption ? `, ${item.curation.caption}` : ''
  }`;

  return (
    <li className="relative group">
      <button
        type="button"
        onClick={onToggle}
        disabled={disabled}
        aria-pressed={selected}
        aria-label={label}
        title={label}
        className="block w-full text-left rounded-lg disabled:cursor-not-allowed"
      >
        {thumbReady ? (
          <img
            src={mediaUrl.thumb(item.id)}
            alt=""
            loading="lazy"
            decoding="async"
            className={`photo-thumb w-full ${selected ? 'selected' : ''} ${disabled ? 'opacity-40' : ''}`}
          />
        ) : (
          <div className="skeleton aspect-square w-full" />
        )}
      </button>

      {/* Badges */}
      <div className="absolute top-1 left-1 flex gap-1 pointer-events-none">
        {item.is360 && <span className="bg-black/75 text-accent-gold text-[8px] font-bold px-1.5 py-0.5 rounded">360°</span>}
        {item.kind === 'video' && item.probe?.durationSec != null && (
          <span className="bg-black/75 text-white text-[10px] font-mono px-1.5 py-0.5 rounded">{formatDuration(item.probe.durationSec)}</span>
        )}
      </div>

      {/* Curation row: highlight count left, score right. Hidden while a full-width state bar is showing. */}
      {item.curation && !inProject && usable.usable && !analysing && (
        <div className="absolute bottom-1 left-1 right-1 flex items-end justify-between gap-1 pointer-events-none" aria-hidden="true">
          {item.kind === 'video' ? (
            <span
              className={`min-w-0 truncate bg-black/75 text-[9px] px-1.5 py-0.5 rounded ${item.curation.highlightCount > 0 ? 'text-text-secondary' : 'text-text-muted'}`}
              title={`${item.curation.highlightCount} usable moment${item.curation.highlightCount === 1 ? '' : 's'}`}
            >
              ▶ {item.curation.highlightCount}
            </span>
          ) : (
            <span />
          )}
          {score !== undefined && (
            <span className="shrink-0 bg-black/75 text-accent-gold text-[10px] font-mono font-bold px-1.5 py-0.5 rounded">{(score * 10).toFixed(1)}</span>
          )}
        </div>
      )}
      {analysing && (
        <span className="absolute bottom-1 left-1 right-1 text-center bg-black/70 text-[9px] text-accent-gold px-1 py-0.5 rounded pointer-events-none truncate animate-pulse">
          Analysing…
        </span>
      )}

      {/* State overlay */}
      {!usable.usable && item.status.probe !== 'failed' && (
        <span className="absolute bottom-1 left-1 right-1 text-center bg-black/70 text-[9px] text-text-secondary px-1 py-0.5 rounded pointer-events-none truncate">
          {usable.reason}
        </span>
      )}
      {item.status.probe === 'failed' && (
        <span className="absolute bottom-1 left-1 right-1 text-center bg-red-500/70 text-[9px] text-white px-1 py-0.5 rounded pointer-events-none truncate">
          Unreadable
        </span>
      )}
      {inProject && (
        <span className="absolute bottom-1 left-1 right-1 text-center bg-accent-gold/80 text-bg-main text-[9px] font-bold px-1 py-0.5 rounded pointer-events-none">
          {wholeInProject ? 'IN PROJECT' : 'MOMENT IN PROJECT'}
        </span>
      )}

      {/* Selection check */}
      {selected && (
        <div className="absolute top-1 right-1 w-5 h-5 bg-accent-gold rounded-full flex items-center justify-center pointer-events-none">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#0a0a0f" strokeWidth="3" aria-hidden="true">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        </div>
      )}
    </li>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function errorText(err: unknown): string {
  if (err instanceof LibraryApiError) return err.message;
  if (err instanceof Error) return err.message;
  return 'Something went wrong';
}

function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

/**
 * Run face detection on the (small, upright) thumbnail and scale the boxes to
 * the dimensions the renderer will draw at.
 */
async function detectFacesScaled(thumbUrl: string, targetWidth: number, targetHeight: number): Promise<FaceRegion[]> {
  const thumbDims = await imageDimensions(thumbUrl);
  if (!thumbDims) return [];
  let faces: FaceRegion[] = [];
  try {
    faces = await detectFaces(thumbUrl);
  } catch {
    return [];
  }
  const sx = targetWidth / thumbDims.width;
  const sy = targetHeight / thumbDims.height;
  return faces.map((f) => ({ ...f, x: f.x * sx, y: f.y * sy, width: f.width * sx, height: f.height * sy }));
}

function imageDimensions(url: string): Promise<{ width: number; height: number } | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = () => resolve(null);
    img.src = url;
  });
}
