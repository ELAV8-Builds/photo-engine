# PhotoForge — Phase 7 handoff (footprint, moments, export control)

You are continuing a multi-phase build. Phases 1–6 are complete and verified on real footage. This document
is the single source of truth for what exists, what is proven, and exactly what Phase 7 must deliver. When
Phase 7 is done, write `docs/handoff/PHASE-8.md` in this same format (what shipped, verified numbers, known
gaps, next scope) so a future window can pick the product up cold.

## 0. Non-negotiables (apply to every phase)

- **Local-first and private.** Media never leaves this Mac unless the user has turned on the Gemini
  provider in Settings (Phase 4). Default provider is Ollama.
- **Never make the machine feel busy.** One job per heavy lane, `nice`d ffmpeg, hardware decode, bounded
  threads, model auto-unload, thermal watchdog. Measure before claiming.
- **Surgical changes.** Touch only what the phase needs. Match existing style. Don't refactor working code.
- **No new npm dependencies, env-file edits, port/URL changes, schema changes, or deletions without the
  user's explicit approval.** Node 20.19 → no in-repo TS test runner; verify pure modules by compiling to
  `/tmp` with a throwaway tsconfig and running Node asserts (§5). Never commit test scripts.
- **Fail loud.** Report anything skipped or unverified. `npx tsc --noEmit -p tsconfig.json` and
  `npx next build` must pass. Stop the dev server before `next build`, then restart with `npm run dev`.
- **Best practices:** typed boundaries, small pure functions, atomic writes, spawn with arg arrays (never
  shell strings), validate every request input, id-addressed media (the browser never sees filesystem
  paths), localhost-only APIs (middleware matcher), structured logging with redaction.

## 1. Product context

PhotoForge (Next.js 14, `src/`) builds montage videos from photos/videos with 12 templates, an effects
engine, in-browser preview and ffmpeg.wasm export. Owner's goals 1–6 are delivered (library curation,
deliberate photo/video mixing, flat 360, best moments, story layer, opt-in Gemini) and Phase 5 made 360
footage special (AI-directed pans, tiny planets, hand reframing). Phase 6 hardened the product: the cache
no longer only grows, exports cannot hang silently, and hand-set views survive re-analysis.

Machine: Mac Studio M3 Ultra (32 cores), macOS 26.6.2, ffmpeg 7.1.1 (VideoToolbox), Ollama 0.33.3 +
`qwen3.5:9b`. X5 card at `/Volumes/Insta360 X5/DCIM/Camera01` (41 `.insv` + `.lrv`, 92.5 min, all curated;
51 moments). Photo test root `/tmp/pf-photos` (13 photos + one synthetic `.insp`, see §2). Both registered.

## 2. What exists

Phases 1–5 are documented in `docs/handoff/DONE.md` (§1–2) and the per-phase files. Phase 6 added:

### Server
- `src/server/storage/gc.ts` — cache inventory + GC. Every artefact is named by item id (20 hex) plus a
  highlight index, or by a shot-list hash (story plans), so ownership is decidable from the filename.
  Pure `classifyArtifact(dir, name)` (one regex per path helper in `thumbnails.ts`, `record.ts`,
  `signals.ts`, `user-views.ts`, `generate.ts`), `isOrphan(ref, known)` — orphan when the item is in no
  root's index, the highlight index is ≥ the record's window count, or a story plan names an unknown item
  (or is unreadable) — and `buildReport()`. I/O: `readStorageReport()`, `clearOrphans()` (deletes only
  paths it classified inside `cache/*`; unrecognised names are counted and never touched; `.<pid>.tmp`
  siblings are skipped — they belong to `maintenance.ts`, whose `TEMP_WITH_PID` is now exported).
- `src/server/curation/user-views.ts` — memory of hand-set views at `cache/analysis/<id>.views.json`
  (`{ start, end, view }[]`). Pure `overlapSec`, `remember` (replaces an entry for the same moment),
  `matchRememberedViews` (greedy by overlap, each remembered view used once, ties → earlier window,
  `MIN_OVERLAP_SEC 0.5`), `applyRememberedViews` (matches only windows that carry a view; restored view
  gets `source: 'user'`, version +1, a one-keyframe static path, `proxy: 'pending'`, `panProxy` cleared).
  Hooks: `setHighlightView` → `rememberUserView`; `analyseItems({ force })` → `rememberUserViewsFrom(previous)`
  before `removeCuration`; `handleCurate` (videos) → `applyRememberedViews` before `saveCuration`.
- `record.ts` — `removeViewFrames(itemId)`; `removeCuration` now also drops yaw-editor frames (they are
  rendered at a window's `sampleT` but named by index, so they would preview the wrong moment after a
  re-curation). Remembered views are deliberately kept.
- `analyseItems({ force })` also cancels a queued `pan360` for the item (a stale one found no record and
  marked `pan: 'skipped'` for good).
- Routes: `GET /api/system/storage` → `StorageReport`; `POST /api/system/storage { action: 'clear-orphans' }`
  → `{ removedFiles, removedBytes, report }`. Façade: `service.storageReport()` / `clearOrphanedArtifacts()`.
- Types: `ArtifactClass` (`thumbnails | renditions | previews360 | highlightClips | viewFrames | analysis |
  storyPlans`), `StorageClassReport`, `StorageReport` in `src/types/library.ts`.

### Browser
- `src/lib/video-frame-extractor.ts` — `seekToTime(video, time, timeoutMs = SEEK_TIMEOUT_MS 10 s)` rejects
  on timeout or a media `error` event and removes both listeners; `RenderStep`'s preview now returns the
  seek promise so a rejection falls back to the thumbnail.
- `src/lib/mp4-encoder.ts` — `withTimeout(promise, ms, what)`; `writeFrame` bounds both `canvas.toBlob` and
  `ffmpeg.writeFile` at `FRAME_WRITE_TIMEOUT_MS 20 s`. Errors reach the existing "Render Failed" panel.
- `src/components/StorageCard.tsx` on `/settings` — total + file count, share bar per class, one row per
  class (files · size · orphaned in amber), the app data path, "Clear N orphaned files · X MB" (gold, only
  when there is something to reclaim; "Nothing orphaned" otherwise) and Refresh; notices go through the
  page banner. `libraryApi.storage()` / `clearOrphans()`.

### Verified numbers (Phase 6)
- **Whole card, forced re-analysis of all 41 clips (balanced profile, hardware decode): 33 min wall**
  (23:30:28 → queue idle 00:03:32). Curation of all 41 finished at ≈ 27 min: 1,604 s of curate compute for
  92.5 min of footage (**3.5× realtime**), 1,097 model grades; pan planning + all renders took the
  remaining ≈ 6.5 min. **168 jobs done, 0 failed, 0 cancelled.** Result: 51 windows — 26 pans, 25 static
  (3 user) — 51/51 flat clips, 26/26 pan clips, 51/51 tiny planets; 41/41 `curate: ready`, 39 `highlights`
  + `pan` ready and 2 skipped (clips with no usable moment). Cache afterwards: 326 files, 2.53 GB.
- **Thermals: `pmset -g therm` reported no CPU speed limit at any of the 33 one-minute samples.** System
  load1 ranged 13–46 during the run but was dominated by a VM (`com.apple.Virtualization` ≈ 270 % CPU) and
  IDE helpers; PhotoForge's `ffmpeg` ran at nice 15 using ≈ 0.25 core. Ollama's `llama-server` used
  **≈ 6.7 cores in bursts at nice 0** during grades — outside PhotoForge's process control today (§3.1).
- **User views across forced re-analysis: 3 remembered, 3 restored exactly** (lens/yaw/pitch), version
  1 → 2, static paths, flat clips re-rendered. One came from a pre-Phase-6 record (captured by
  `rememberUserViewsFrom` at force time), two from `PUT …/view`. The re-analysis reproduced identical windows,
  so the live run exercised full (4 s) overlap only; partial-overlap and greedy matching are covered by the
  pure checks.
- **Cache GC:** inventory classified 330/330 files (2.54 GB, 0 unrecognised) matching `du`. A real orphan
  scenario — `touch` one photo, rescan (new id) — produced exactly 3 orphans (old thumbnail 26,737 B, old
  record 490 B, the one story plan naming the old id 6,230 B); Clear removed exactly those 3 (server log
  `files: 3, bytes: 33457`) while 41 background jobs were running and 2 new renders landed untouched.
  `GET` 13 ms, `POST` 24 ms on this cache.
- **Export with bounded waits:** Auto-pick 6 (4 photos + 2 video moments) → Cinematic Journey → 720p,
  8 slots / 32 s → **complete in 147 s**, MP4 9,680,362 B, 37.2 s, 1280×720. With seeks stalled in-page
  (no-op `currentTime` setter) the same export **failed visibly after the 10 s bound**: "Render Failed — No
  video frame arrived at 0.52 s within 10 s — the browser stalled on this clip. Try the export again." + Try
  Again (44 s total incl. the photo slots before the first video frame).
- **`.insp` path (synthetic):** a 1664×832 dual-fisheye JPEG pulled from `LRV_…_005.lrv` @ 58 s and saved as
  `IMG_20260724_123342_00_099.insp` in `/tmp/pf-photos` → indexed `is360`, probe 2:1, thumbnail 512×256
  equirect (whole sphere visible), rendition 2048×1152 flat lens-A reframe (no lens edges), curated locally
  (score 6.8, "Tourists in grand cathedral").
- Settings Storage card QA at 375 / 768 / 1280 (dark), states default / disabled / loading / focus-visible
  (2 px gold ring, forced via CDP because the harness cannot send a real Tab); accessibility tree exposes
  each row as "Thumbnails grid and moment thumbnails 55 files 1.1 MB 26.1 KB orphaned".
- Pure checks: 16 passing (gc 4, user-views 4, bounded seek 5, withTimeout 3). `tsc` + `next build` pass
  (build 14 s).

### NOT verified (say so in your report if you also cannot)
- **Gemini with a real key.** `cloudSession.active` stayed `false` — no key was pasted into Settings during
  Phase 6. To verify: Settings → Google Gemini → paste key → Test connection (expect "Connected: gemini ·
  gemini-3.5-flash-lite"), then Library → Re-analyse 1 selected clip and Write story; check the job finishes
  with `provider: gemini` in `/api/jobs` recent, the record's `provider` field, and that the dev log contains
  0 occurrences of the key (`redact()`).
- **A real X5 `.insp`.** The synthetic file proves the code path, not the camera's file: resolution/EXIF
  orientation, lens order (lens A = right half is assumed by analogy with the `.lrv`), and any APP segments
  ffmpeg's mjpeg decoder might reject remain unverified.
- **Photos library happy path.** `photosLibrary: { found: true, readable: false }` — Full Disk Access is not
  granted to the launching app (Cursor/Terminal). Grant it in System Settings → Privacy & Security → Full
  Disk Access, restart the dev server, then "Add Photos Library" in the Library panel.

### Known gaps
- `LibraryItem.error` is never cleared once a step later succeeds (`VID_20260727_182429_00_040.insv` still
  shows a Phase-1 ffmpeg message with every step ready/skipped).
- Yaw-editor frames are named by window index only; `removeCuration` now deletes them, but naming them by
  `sampleT` would let the editor cache survive re-analysis.
- GC is on-demand (Settings). No automatic sweep at boot or after a root is removed — a policy choice for
  the owner.
- `highlightCap = round(duration/150)` → one moment for clips under 225 s (35 of 41 card clips).
- Template step edits the base template while render uses the expanded one; split-screen slots draw text
  only with a base overlay (pre-existing).
- Export has no Cancel; every wait is now bounded, so one is straightforward (§3.4).
- `/tmp/pf-photos` now holds the synthetic `.insp` and a `touch`ed `IMG_01.jpg` (its old id's artefacts
  were the GC test orphans and are gone).

## 3. Phase 7 scope — footprint, moments, export control

Goal: make the pipeline's *model* footprint as disciplined as its ffmpeg footprint, let short clips
contribute more than one moment when they deserve it, and give the export the control a bounded pipeline
now allows. Every item is measured on the X5 card before it is called done.

### 3.1 Bound the model lane's CPU (measure first)
- Fact (Phase 6): `llama-server` burst to ≈ 6.7 cores at nice 0 during grades while PhotoForge's own
  children sat at nice 15. Ollama's per-request `options.num_thread` is the lever that needs no env edit.
- Add `threads` from the active `ResourceBudget` (quiet 2 / balanced 4 / fast 8) to the Ollama request
  options in `src/server/ai/ollama.ts` for `gradeFrame` and `writeJson`. Measure `llama-server` CPU % and
  per-grade latency on 5 clips before/after (`ps -o pcpu` sampled every second during a curate job). If
  `num_thread` does not move the vision encoder's CPU use, say so and stop — do not add process-level
  hacks (renicing Ollama is the user's process, not ours).
- Definition of done: a table of profile → cores → s/grade; curation of the whole card still finishes with
  0 failures; the "Performance" card copy mentions the model lane if the lever works.

### 3.2 More than one moment for short clips
- `highlightCap` gives one moment under 225 s. Allow a second when the clip has two candidates ≥ 20 s apart
  whose fused scores are both within 15 % of the top (pure change in `selectPeaks`/`highlightCap`, with
  asserts). Expect ≈ 10–15 extra moments on the card; check three of them by eye (pull a frame from each
  rendered clip) and that Auto-pick still prefers the stronger one when both compete for a slot.

### 3.3 Reframe editor: pan preview + planet rotation
- ReframePanel shows one frame at `sampleT`. Add a three-frame strip (start / peak / end of `viewPath`)
  reusing `GET …/frame` with a `?t=` parameter (validated: within the window ± margin) so the user sees what
  the pan will pass through, and a "Keep the pan" vs "Static view" choice on Apply (today Apply always
  collapses to static).
- Tiny planets ignore the view; add a `rotationDeg` (yaw of the `sg` output, ±180°, 15° steps) stored on the
  window (`HighlightWindow.planetRotationDeg?`) and applied in `renderTinyPlanetProxy` — schema addition, so
  ask before adding the field. Verify from frames of a re-rendered planet clip.

### 3.4 Export control
- Cancel button during `preparing | rendering | encoding`: an `AbortController` threaded through
  `renderSlotFramesToFFmpeg` / transitions / fade; abort rejects the current bounded wait, `cleanupFS` runs,
  status returns to idle with a notice. Also record the slot/frame in the "Render Failed" message so a stall
  can be traced to a clip.
- Fix the pre-existing template-step gap: edits made on the base template must map onto the expanded one
  the render uses (or edit the expanded template directly). Verify with one edited slot exported.

### 3.5 Hygiene
- Clear `LibraryItem.error` when the step that set it later succeeds (`setStep` → `ready` clears it).
- Name yaw-editor frames by `sampleT` (e.g. `…-view-<t>-<lens>-<yaw>-<pitch>.jpg`) and teach
  `classifyArtifact` the new form; old-form files become unrecognised → add them to the orphan rules.
- Verify Gemini and the Photos library if the owner provides the key / grants Full Disk Access (steps in §2).

### 3.6 Safety
- No new lanes, no new concurrency. Model-thread bounding is per request. Every ffmpeg addition runs on the
  `ffmpeg` lane under the active budget; new request parameters are validated and clamped.

### 3.7 Definition of done
- Measured before/after table for §3.1; whole card re-curated with 0 failed jobs and clean `pmset -g therm`.
- ≥ 10 extra moments on the card from §3.2 with three checked by eye.
- Pan strip + planet rotation round-trip in the browser (edit → re-render → new frames).
- Export cancel verified mid-render; a full export still completes; template-step edit reaches the export.
- `tsc` + `next build` pass; browser QA at 375 / 768 / 1280; pure checks extended; write `PHASE-8.md`.

## 4. How to run
```
npm run dev              # http://127.0.0.1:5190 (localhost-only by design)
npx tsc --noEmit -p tsconfig.json
npx next build           # stop the dev server first, then npm run dev again
```
Settings page: http://127.0.0.1:5190/settings (Storage card at the bottom). App data:
`~/Library/Application Support/PhotoForge` (safe to delete; media is never touched).

## 5. Pure-module check recipe (used in Phases 2–6)
`/tmp/pf6/tsconfig.test.json` extends the repo tsconfig with `noEmit:false`, `outDir:/tmp/pf6/build`,
`rootDir:<repo>/src`, `module:commonjs`, `moduleResolution:node`, `target:es2020`, `incremental:false`,
`plugins:[]`, and includes `src/server/**`, `src/types/**`, `src/lib/video-frame-extractor.ts`,
`src/lib/mp4-encoder.ts`. The test file installs a `Module._resolveFilename` shim mapping `@/…` to the build
dir, falls back to `<repo>/node_modules` for bare imports, and stubs `@ffmpeg/ffmpeg` / `@ffmpeg/util`
(the UMD build cannot load in Node). Run with `PHOTOFORGE_DATA_DIR=/tmp/pf6/data` so path helpers never
point at the real app data. Recreate as needed; never commit it.
