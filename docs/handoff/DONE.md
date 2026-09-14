# PhotoForge — Library & Local AI Curation: phases 1–5 complete

This is the closing handoff for the five-phase build (`docs/handoff/PHASE-2.md` … `PHASE-5.md` hold the
per-phase specs and verified numbers). It records what shipped in Phase 5, what was measured, what is known
to be missing or unverified, and what a future window should do first.

## 0. Non-negotiables (still apply to any follow-up)

- Local-first and private; Gemini only when the user turns it on in Settings, key in the browser only.
- Never make the machine feel busy: one job per heavy lane, `nice`d ffmpeg, hardware decode, bounded threads,
  model auto-unload, thermal watchdog. Measure before claiming.
- Surgical changes; no new npm dependencies, env edits, port changes, schema changes or deletions without asking.
- Fail loud; `npx tsc --noEmit -p tsconfig.json` and `npx next build` must pass (stop the dev server first).
- Typed boundaries, pure functions, atomic writes, spawn with arg arrays, validate inputs, id-addressed media,
  localhost-only APIs, redacting logs.

## 1. What Phase 5 built (360 signature moves)

### Server
- `src/server/media/pan.ts` — `renderPanProxy()` (flat 1080p clip whose view moves along keyframes; `v360`
  yaw/pitch driven by a `sendcmd` script of **relative** eased deltas every 0.1 s, script written to the job
  tmp dir), `renderTinyPlanetProxy()` (square stereographic clip from the dual-fisheye `.lrv`:
  `v360=input=dfisheye:output=sg:h_fov=250:v_fov=250:pitch=-90`), `renderViewFrame()` (one flat frame at any
  view — the yaw editor's preview); pure `viewAt`, `buildPanCommands`, `pathSweepDeg`, `clampPath`,
  limits `PAN_YAW_LIMIT_DEG 45`, `PAN_PITCH_LIMIT_DEG 35`, `PAN_MIN_SWEEP_DEG 10`, `PAN_MAX_SWEEP_DEG 120`.
- `src/server/analysis/pan-plan.ts` — `planViewPaths()`: for each window with a model view and no path,
  grade the three same-lens yaws at the window's start and end (6 grades), build start → peak → end,
  clamp/simplify, decide `pan` vs `static`; user-set views become a one-keyframe static path. Every window
  also gets `planetProxy: 'pending'`.
- Jobs: new `pan360` (model lane, priority 55, honours the provider choice; skips items without highlights)
  → sets `status.pan = ready` and `status.highlights = pending`; the `highlights` job (ffmpeg lane) now
  renders three artefacts per window as needed — flat clip, pan clip (`<id>-hl-<n>-pan.mp4`), tiny planet
  (`<id>-hl-<n>-planet.mp4`, skipped when no `.lrv`). `ItemStatus.pan` added; existing indexes migrate on
  load (`pending` for 360 videos).
- `library/service.ts` — `setHighlightView(itemId, n, { lens, yawDeg, pitchDeg })`: cancels that item's
  render jobs, marks `view.source = 'user'`, bumps `view.version`, drops the window's clips/thumb, sets a
  static path, queues re-render. `removeHighlightArtifacts()` in `curation/record.ts`.
- Routes: `GET|HEAD /api/media/[id]/highlight/[n]/pan/stream`, `…/planet/stream`,
  `GET …/highlight/[n]/frame?lens=a|b&yaw=&pitch=` (whole degrees, clamped, cached per angle, shares the
  rendition concurrency cap), `PUT /api/library/items/[id]/highlights/[n]/view`.
- `select.ts` → `MontagePick.highlightPanReady / highlightPlanetReady / viewVersion`.
- Story: `ShotRole` gains `planet` (at most one, only on a `360 video` shot — the prompt marks 360 shots,
  `normaliseShotList` enforces it, the heuristic picks the best-scoring 360 beat when ≥ 3 shots).
- `.insp` (360 photos): `isDualFisheyePhoto()` gates on the probed 2:1 aspect; thumbnail = equirect
  panorama, rendition = flat 16:9 lens-A reframe. **Unverified** — no `.insp` on the card.

### Browser
- `library-client.ts` — `mediaUrl.highlightPan / highlightPlanet / highlightFrame`, `?v=` cache-busting from
  `viewVersion`; `montagePickToMediaFile()` prefers the pan clip and sets `MediaFile.planetUrl`.
- `MediaFile.planetUrl`, `TemplateSlot.reframe: 'flat' | 'tiny-planet'`; `RenderStep.mediaForSlot()` swaps
  a 360 highlight to its square planet clip on `tiny-planet` slots (preview + export + transitions + fade).
- Templates: Cinematic Journey closes on a tiny planet (the reframe follows the real last slot when the
  template is expanded), Summer Vibes opens on one; `applyShotRoles` turns the story's `planet` role into
  a centred, single-layout, slightly longer tiny-planet slot.
- `components/ReframePanel.tsx` + a "⟲ REFRAME" affordance on 360 moments in `MediaStep`: lens (A/B),
  yaw ±45°, pitch ±35° range sliders (keyboard 5° steps), debounced server-rendered preview, Apply →
  polls the record until the clip is re-rendered → swaps the media entry's URLs (versioned).

## 2. Verified (X5 card, balanced profile, hardware decode)
- Whole card: **51/51 windows got view paths; 27 pans (45° or 90° sweeps), 24 static; 27/27 pan clips
  (142 MB) and 51/51 tiny-planet clips (195 MB) rendered; 0 failed jobs; `pmset -g therm` clean.** The
  pan-planning + render pass over 41 clips (≈ 300 extra grades) took ≈ 14 min wall from restart.
- Pan proof (before the pipeline): eased −40° → +40° over 4 s at 720p from the `.lrv` in **1.5 s**; absolute
  commands wrap (they accumulate) — deltas do not.
- Real pan clip inspected frame-by-frame (clip 016, path 0° → −45° → 0°): face → stairwell → archway, no lens
  edges. Real planet clip: castle interior as a planet.
- Reframe round-trip in the browser: opened on the auto-picked moment (model view A/+45°), set A/0°/−10°,
  Apply → clip + thumbnail re-rendered in **6 s**, record shows `source: 'user', version: 1`, pan removed
  (static), grid thumbnail switched to `…/thumb?v=1` and shows the new direction.
- Auto-pick → Cinematic Journey → Export (720p, 12 slots, 57.4 s): frames pulled from the MP4 show the
  opening slot **panning** across the cathedral interior (0.6 / 2.5 / 4.4 s) and the closing slot as a
  **tiny planet** of the castle square. Three visibly different pans checked frame-by-frame overall
  (clip 016 face → stairwell → archway, clip 005 cathedral sweep, clip 030 dark → face → corridor).
- **Export hang — root cause found and fixed.** The Phase 3 "hangs in a long-lived tab" was the canvas
  preview: its effect did not depend on `progress.status`, so it kept animating during export and re-seeking
  the cached `<video>` elements the exporter shares (~18 seeks/s measured on the stuck element), so the
  exporter's own `seeked` never fired. The preview now pauses while a render is in flight
  (`exportInFlight` in `RenderStep`); a fresh run wrote 1,451 frames in the first 25 s where the stuck run
  wrote none. `getVideoElement` also restarts the load for a cached element whose data was evicted
  (`readyState < 2`) and rejects after 20 s instead of waiting forever.
- Pure checks: 21 (curation/redaction/gemini/pan) + 11 (story/planet role) passing. `tsc` + `next build` pass.

## 3. Not verified / known gaps
- `.insp` reframing (no sample file). Lens A = right half is assumed by analogy with the `.lrv`.
- A **forced** re-analysis rebuilds windows and therefore discards user views (they survive `pan360`
  re-planning and normal operation). Preserve-by-time-overlap would be the fix if it matters.
- Gemini end-to-end with a real key (Phase 4) still unverified.
- `seekToTime` / `writeFrame` still have no timeouts (the known hang cause is fixed; a bounded wait would
  turn any future stall into a visible error).
- Template step edits the base template while render uses the expanded one; split-screen slots draw text
  only with a base overlay (pre-existing).
- Photos library needs Full Disk Access for the launching app; happy path unverified.
- Cache GC for orphaned artefacts (thumbs, proxies, highlight/pan/planet clips, story plans, view frames)
  is not implemented — the cache only grows.
- `highlightCap = round(duration/150)` → one moment for clips under 225 s.

## 4. What next (suggested order)
1. Cache GC + a Settings "storage" card (sizes per artefact class, one-click clear of orphans).
2. Bounded waits in `seekToTime` / `writeFrame` with a visible error, as belt-and-braces after the preview fix.
3. Preserve user views across forced re-analysis by matching windows on time overlap.
4. Verify Gemini with a real key; verify `.insp` with a real file; grant Full Disk Access and verify the
   Photos-library happy path.
5. Optional: pan keyframes per second instead of start/peak/end (more grades, smoother direction changes);
   yaw editor for the story's planet shot; a "pan preview" scrub in ReframePanel.

## 5. How to run
```
npm run dev              # http://127.0.0.1:5190 (localhost-only by design)
npx tsc --noEmit -p tsconfig.json
npx next build           # stop the dev server first, then npm run dev again
```
App data: `~/Library/Application Support/PhotoForge` (safe to delete; media is never touched).
Pure-module check recipe: `docs/handoff/PHASE-5.md` §5.
