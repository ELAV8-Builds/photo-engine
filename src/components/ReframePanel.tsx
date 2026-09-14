'use client';

/**
 * ReframePanel — Phase 5. Lets the user choose where a 360 highlight looks:
 * lens, yaw (±45°) and pitch (±35°), previewed with a server-rendered frame at
 * the window's peak. Apply re-renders the highlight's clips on the server and
 * hands back the media entry with cache-busted URLs.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { MediaFile } from '@/types';
import type { HighlightWindow } from '@/types/library';
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
  const [busy, setBusy] = useState<'apply' | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Current view from the curation record.
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
      })
      .catch((err) => !cancelled && setError(err instanceof LibraryApiError ? err.message : 'Could not load this moment'));
    return () => {
      cancelled = true;
    };
  }, [ref]);

  // Debounced preview frame.
  useEffect(() => {
    if (!ref || !initial) return;
    if (debounce.current) clearTimeout(debounce.current);
    setPreviewLoading(true);
    debounce.current = setTimeout(() => {
      setPreviewUrl(mediaUrl.highlightFrame(ref.itemId, ref.index, lens, yaw, pitch));
    }, PREVIEW_DEBOUNCE_MS);
    return () => {
      if (debounce.current) clearTimeout(debounce.current);
    };
  }, [ref, initial, lens, yaw, pitch]);

  const changed = !!initial && (initial.lens !== lens || initial.yaw !== yaw || initial.pitch !== pitch);

  const apply = useCallback(async () => {
    if (!ref) return;
    setBusy('apply');
    setError(null);
    setStatus('Re-rendering this moment with the new view…');
    try {
      const { highlight } = await libraryApi.setHighlightView(ref.itemId, ref.index, { lens, yawDeg: yaw, pitchDeg: pitch });
      const deadline = Date.now() + RENDER_TIMEOUT_MS;
      let latest: HighlightWindow = highlight;
      while (latest.proxy !== 'ready' && latest.proxy !== 'failed' && Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, RENDER_POLL_MS));
        const record = await libraryApi.curation(ref.itemId);
        latest = record.highlights.find((w) => w.index === ref.index) ?? latest;
      }
      if (latest.proxy !== 'ready') throw new Error(latest.proxy === 'failed' ? 'The clip failed to render' : 'Rendering is taking longer than expected — it will finish in the background');
      const v = latest.view?.version;
      onApplied({
        ...media,
        url: mediaUrl.highlight(ref.itemId, ref.index, v),
        thumbnailUrl: mediaUrl.highlightThumb(ref.itemId, ref.index, v),
        planetUrl: latest.planetProxy === 'ready' ? mediaUrl.highlightPlanet(ref.itemId, ref.index, v) : undefined,
        faces: [],
      });
      setInitial({ lens, yaw, pitch });
      setStatus('Applied. The moment now looks this way in the project.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not apply the view');
      setStatus(null);
    } finally {
      setBusy(null);
    }
  }, [ref, lens, yaw, pitch, media, onApplied]);

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
