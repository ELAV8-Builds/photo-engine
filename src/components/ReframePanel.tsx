'use client';

/**
 * ReframePanel — Phase 5. Lets the user choose where a 360 highlight looks:
 * lens, yaw (±45°) and pitch (±35°), previewed with a server-rendered frame at
 * the window's peak. Apply re-renders the highlight's clips on the server and
 * hands back the media entry with cache-busted URLs.
 *
 * Phase 7 (§3.3): moments with a real pan also show a three-frame strip
 * (start / peak / end of the view path) so the user sees what the pan passes
 * through, and Apply offers "Keep the pan" (the whole path shifts by the
 * user's adjustment) versus "Static view" (the pre-Phase-7 behaviour).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { MediaFile } from '@/types';
import type { HighlightWindow, ViewKeyframe } from '@/types/library';
import { libraryApi, LibraryApiError, mediaUrl } from '@/lib/library-client';

interface ReframePanelProps {
  media: MediaFile;
  onApplied: (updated: MediaFile) => void;
  onClose: () => void;
}

const YAW_LIMIT = 45;
const PITCH_LIMIT = 35;
const STEP = 5;
const PREVIEW_DEBOUNCE_MS = 250;
const RENDER_POLL_MS = 2000;
const RENDER_TIMEOUT_MS = 180_000;

/** `lib-<itemId>-hl<n>` → parts; null for anything else. */
export function parseHighlightMediaId(id: string): { itemId: string; index: number } | null {
  const m = /^lib-([a-f0-9]{20})-hl(\d+)$/.exec(id);
  return m ? { itemId: m[1], index: Number(m[2]) } : null;
}

export default function ReframePanel({ media, onApplied, onClose }: ReframePanelProps) {
  const ref = useMemo(() => parseHighlightMediaId(media.id), [media.id]);
  const [lens, setLens] = useState<'a' | 'b'>('a');
  const [yaw, setYaw] = useState(0);
  const [pitch, setPitch] = useState(0);
  const [initial, setInitial] = useState<{ lens: 'a' | 'b'; yaw: number; pitch: number } | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  // Phase 7: the window's peak time, view path (pan strip) and planet state.
  const [win, setWin] = useState<{ sampleT: number; path: ViewKeyframe[]; planet?: string } | null>(null);
  const [panMode, setPanMode] = useState<'pan' | 'static'>('static');
  const [stripUrls, setStripUrls] = useState<Array<{ label: string; t: number; url: string }> | null>(null);
  const [planetRot, setPlanetRot] = useState(0);
  const [initialRot, setInitialRot] = useState(0);
  const [busy, setBusy] = useState<'apply' | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  const hasPan = (win?.path.length ?? 0) >= 2;
  const hasPlanet = !!win && win.planet !== undefined && win.planet !== 'skipped';

  // Current view + path from the curation record.
  useEffect(() => {
    if (!ref) return;
    let cancelled = false;
    libraryApi
      .curation(ref.itemId)
      .then((record) => {
        if (cancelled) return;
        const h = record.highlights.find((w) => w.index === ref.index);
        const v = h?.view ?? { lens: 'a' as const, yawDeg: 0, pitchDeg: 0 };
        setLens(v.lens);
        setYaw(v.yawDeg);
        setPitch(v.pitchDeg);
        setInitial({ lens: v.lens, yaw: v.yawDeg, pitch: v.pitchDeg });
        const path = h?.viewPath ?? [];
        setWin(h ? { sampleT: h.sampleT, path, planet: h.planetProxy } : null);
        setPanMode(path.length >= 2 ? 'pan' : 'static');
        const rot = h?.planetRotationDeg ?? 0;
        setPlanetRot(rot);
        setInitialRot(rot);
      })
      .catch((err) => !cancelled && setError(err instanceof LibraryApiError ? err.message : 'Could not load this moment'));
    return () => {
      cancelled = true;
    };
  }, [ref]);

  // Debounced preview frame (and, for panning moments, the start/peak/end strip
  // with the user's adjustment applied to the whole path, clamped like the server).
  useEffect(() => {
    if (!ref || !initial) return;
    if (debounce.current) clearTimeout(debounce.current);
    setPreviewLoading(true);
    debounce.current = setTimeout(() => {
      setPreviewUrl(mediaUrl.highlightFrame(ref.itemId, ref.index, lens, yaw, pitch));
      if (win && win.path.length >= 2) {
        const clampTo = (v: number, limit: number) => Math.max(-limit, Math.min(limit, Math.round(v)));
        const shifted = (k: ViewKeyframe) =>
          mediaUrl.highlightFrame(ref.itemId, ref.index, lens, clampTo(k.yawDeg + (yaw - initial.yaw), YAW_LIMIT), clampTo(k.pitchDeg + (pitch - initial.pitch), PITCH_LIMIT), k.t);
        const first = win.path[0];
        const last = win.path[win.path.length - 1];
        setStripUrls([
          { label: 'Start', t: first.t, url: shifted(first) },
          { label: 'Peak', t: win.sampleT, url: mediaUrl.highlightFrame(ref.itemId, ref.index, lens, yaw, pitch, win.sampleT) },
          { label: 'End', t: last.t, url: shifted(last) },
        ]);
      } else {
        setStripUrls(null);
      }
    }, PREVIEW_DEBOUNCE_MS);
    return () => {
      if (debounce.current) clearTimeout(debounce.current);
    };
  }, [ref, initial, lens, yaw, pitch, win]);

  const viewChanged = !!initial && (initial.lens !== lens || initial.yaw !== yaw || initial.pitch !== pitch);
  // Switching a panning moment to "Static view" or spinning the planet are changes on their own.
  const changed = viewChanged || (hasPan && panMode === 'static') || (hasPlanet && planetRot !== initialRot);

  const apply = useCallback(async () => {
    if (!ref) return;
    const keepPan = hasPan && panMode === 'pan';
    setBusy('apply');
    setError(null);
    setStatus(keepPan ? 'Re-rendering this moment with the shifted pan…' : 'Re-rendering this moment with the new view…');
    try {
      const { highlight } = await libraryApi.setHighlightView(ref.itemId, ref.index, {
        lens,
        yawDeg: yaw,
        pitchDeg: pitch,
        keepPan,
        ...(hasPlanet ? { planetRotationDeg: planetRot } : {}),
      });
      // The server may have collapsed a shifted path that no longer sweeps enough.
      const waitPan = highlight.panProxy === 'pending';
      const waitPlanet = hasPlanet && planetRot !== initialRot;
      const deadline = Date.now() + RENDER_TIMEOUT_MS;
      let latest: HighlightWindow = highlight;
      const settled = (w: HighlightWindow) =>
        (w.proxy === 'ready' || w.proxy === 'failed') &&
        (!waitPan || w.panProxy === 'ready' || w.panProxy === 'failed' || w.panProxy === undefined) &&
        (!waitPlanet || w.planetProxy === 'ready' || w.planetProxy === 'failed' || w.planetProxy === 'skipped');
      while (!settled(latest) && Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, RENDER_POLL_MS));
        const record = await libraryApi.curation(ref.itemId);
        latest = record.highlights.find((w) => w.index === ref.index) ?? latest;
      }
      if (latest.proxy !== 'ready') throw new Error(latest.proxy === 'failed' ? 'The clip failed to render' : 'Rendering is taking longer than expected — it will finish in the background');
      const v = latest.view?.version;
      const panReady = waitPan && latest.panProxy === 'ready';
      onApplied({
        ...media,
        url: panReady ? mediaUrl.highlightPan(ref.itemId, ref.index, v) : mediaUrl.highlight(ref.itemId, ref.index, v),
        thumbnailUrl: mediaUrl.highlightThumb(ref.itemId, ref.index, v),
        planetUrl: latest.planetProxy === 'ready' ? mediaUrl.highlightPlanet(ref.itemId, ref.index, v) : undefined,
        faces: [],
      });
      setInitial({ lens, yaw, pitch });
      setInitialRot(latest.planetRotationDeg ?? 0);
      setPlanetRot(latest.planetRotationDeg ?? 0);
      const path = latest.viewPath ?? [];
      setWin({ sampleT: latest.sampleT, path, planet: latest.planetProxy });
      setPanMode(path.length >= 2 ? 'pan' : 'static');
      setStatus(
        panReady
          ? 'Applied. The pan now moves through your adjusted views.'
          : keepPan && !panReady
            ? 'Applied as a static view — the shifted pan no longer moved enough to keep.'
            : 'Applied. The moment now looks this way in the project.',
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not apply the view');
      setStatus(null);
    } finally {
      setBusy(null);
    }
  }, [ref, lens, yaw, pitch, hasPan, panMode, hasPlanet, planetRot, initialRot, media, onApplied]);

  if (!ref) return null;

  return (
    <section className="card-glow p-4 space-y-3" aria-labelledby="reframe-heading">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h3 id="reframe-heading" className="text-sm font-bold text-white truncate">
            Reframe · {media.name}
          </h3>
          <p className="text-[11px] text-text-muted">Choose where this 360 moment looks. Arrow keys nudge the sliders in 5° steps.</p>
        </div>
        <button type="button" onClick={onClose} className="text-text-muted hover:text-white p-1" aria-label="Close reframe">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>

      <div className="grid gap-4 md:grid-cols-[1.6fr_1fr]">
        <div className="space-y-2 min-w-0">
          <div className="relative rounded-lg overflow-hidden bg-black aspect-video">
            {previewUrl && (
              <img
                src={previewUrl}
                alt={`Preview at yaw ${yaw}°, pitch ${pitch}°, lens ${lens.toUpperCase()}`}
                className="w-full h-full object-contain"
                onLoad={() => setPreviewLoading(false)}
                onError={() => {
                  setPreviewLoading(false);
                  setError('Preview could not be rendered');
                }}
              />
            )}
            {(previewLoading || !previewUrl) && <div className="absolute inset-0 skeleton opacity-60" aria-hidden="true" />}
          </div>

          {/* Phase 7: what the pan passes through (start / peak / end of the view path). */}
          {hasPan && stripUrls && (
            <div className="grid grid-cols-3 gap-2" role="group" aria-label="Pan preview: start, peak and end of the camera move">
              {stripUrls.map((s) => (
                <figure key={s.label} className="m-0">
                  <div className="relative rounded-lg overflow-hidden bg-black aspect-video">
                    <img src={s.url} alt={`${s.label} of the pan at ${s.t.toFixed(1)} s`} className="w-full h-full object-cover" loading="lazy" />
                  </div>
                  <figcaption className="mt-1 text-[10px] text-text-muted text-center">
                    {s.label} · {s.t.toFixed(1)}s
                  </figcaption>
                </figure>
              ))}
            </div>
          )}
        </div>

        <div className="space-y-4">
          <fieldset className="space-y-1">
            <legend className="text-xs text-text-muted">Lens</legend>
            <div className="flex gap-1" role="radiogroup" aria-label="Lens">
              {(['a', 'b'] as const).map((l) => (
                <button
                  key={l}
                  type="button"
                  role="radio"
                  aria-checked={lens === l}
                  onClick={() => setLens(l)}
                  className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${lens === l ? 'bg-accent-gold text-bg-main' : 'text-text-secondary hover:text-white bg-bg-input'}`}
                >
                  {l === 'a' ? 'Front (A)' : 'Back (B)'}
                </button>
              ))}
            </div>
          </fieldset>

          <div>
            <label htmlFor="reframe-yaw" className="flex items-center justify-between text-xs text-text-muted">
              <span>Yaw</span>
              <span className="font-mono text-text-secondary">{yaw > 0 ? '+' : ''}{yaw}°</span>
            </label>
            <input
              id="reframe-yaw"
              type="range"
              min={-YAW_LIMIT}
              max={YAW_LIMIT}
              step={STEP}
              value={yaw}
              onChange={(e) => setYaw(Number(e.target.value))}
              className="w-full accent-[#FFD700]"
            />
          </div>
          <div>
            <label htmlFor="reframe-pitch" className="flex items-center justify-between text-xs text-text-muted">
              <span>Pitch</span>
              <span className="font-mono text-text-secondary">{pitch > 0 ? '+' : ''}{pitch}°</span>
            </label>
            <input
              id="reframe-pitch"
              type="range"
              min={-PITCH_LIMIT}
              max={PITCH_LIMIT}
              step={STEP}
              value={pitch}
              onChange={(e) => setPitch(Number(e.target.value))}
              className="w-full accent-[#FFD700]"
            />
          </div>

          {/* Phase 7: spin the tiny-planet render of this moment (±180°, 15° steps). */}
          {hasPlanet && (
            <div>
              <label htmlFor="reframe-planet-rot" className="flex items-center justify-between text-xs text-text-muted">
                <span>Planet spin</span>
                <span className="font-mono text-text-secondary">{planetRot > 0 ? '+' : ''}{planetRot}°</span>
              </label>
              <input
                id="reframe-planet-rot"
                type="range"
                min={-180}
                max={180}
                step={15}
                value={planetRot}
                onChange={(e) => setPlanetRot(Number(e.target.value))}
                className="w-full accent-[#FFD700]"
              />
              <p className="text-[10px] text-text-muted">Rotates the tiny-planet clip only; the flat view above is not affected.</p>
            </div>
          )}

          {/* Phase 7: this moment pans — keep the move (shifted by the adjustment) or hold a static view. */}
          {hasPan && (
            <fieldset className="space-y-1">
              <legend className="text-xs text-text-muted">This moment pans</legend>
              <div className="flex gap-1" role="radiogroup" aria-label="Pan behaviour on apply">
                {([
                  { mode: 'pan' as const, label: 'Keep the pan' },
                  { mode: 'static' as const, label: 'Static view' },
                ]).map(({ mode, label }) => (
                  <button
                    key={mode}
                    type="button"
                    role="radio"
                    aria-checked={panMode === mode}
                    onClick={() => setPanMode(mode)}
                    disabled={busy === 'apply'}
                    className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${panMode === mode ? 'bg-accent-gold text-bg-main' : 'text-text-secondary hover:text-white bg-bg-input'}`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <p className="text-[10px] text-text-muted">Keep the pan moves the whole camera path by your adjustment; static holds exactly this view.</p>
            </fieldset>
          )}

          <div className="flex items-center gap-2 pt-1">
            <button
              type="button"
              onClick={apply}
              disabled={!changed || busy === 'apply'}
              className="btn-gold !py-1.5 !px-4 !rounded-full text-xs"
            >
              {busy === 'apply' ? 'Rendering…' : 'Apply view'}
            </button>
            <button
              type="button"
              onClick={() => {
                if (!initial) return;
                setLens(initial.lens);
                setYaw(initial.yaw);
                setPitch(initial.pitch);
                setPanMode(hasPan ? 'pan' : 'static');
                setPlanetRot(initialRot);
              }}
              disabled={!changed || busy === 'apply'}
              className="text-xs text-text-muted hover:text-white disabled:opacity-40"
            >
              Reset
            </button>
          </div>
          {status && (
            <p className="text-[11px] text-text-secondary" role="status">
              {status}
            </p>
          )}
          {error && (
            <p className="text-[11px] text-red-400" role="alert">
              {error}
            </p>
          )}
        </div>
      </div>
    </section>
  );
}
