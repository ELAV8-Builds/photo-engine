# PhotoForge — Phase 8 handoff (moment quality, durable edits, cancel polish)

You are continuing a multi-phase build. Phases 1–7 are complete and verified on real footage. This document
is the single source of truth for what exists, what is proven, and exactly what Phase 8 must deliver. When
Phase 8 is done, write `docs/handoff/PHASE-9.md` in this same format (what shipped, verified numbers, known
gaps, next scope) so a future window can pick the product up cold.

## 0. Non-negotiables (apply to every phase)

- **Local-first and private.** Media never leaves this Mac unless the user has turned on the Gemini
  provider in Settings (Phase 4). Default provider is Ollama.
- **Never make the machine feel busy.** One job per heavy lane, `nice`d ffmpeg, hardware decode, bounded
  threads (ffmpeg **and** the model lane since Phase 7), model auto-unload, thermal watchdog. Measure
  before claiming.
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
engine, in-browser preview and ffmpeg.wasm export. Owner's goals 1–6 are delivered, Phase 5 made 360
footage special (AI-directed pans, tiny planets, hand reframing), Phase 6 hardened the cache/exports, and
Phase 7 disciplined the model lane's CPU, let short clips carry a second strong moment, gave the reframe
editor pan preview + planet rotation, and gave the export a Cancel plus correct text-override mapping.

Machine: Mac Studio M3 Ultra (32 cores), macOS 26.6.2, ffmpeg 7.1.1 (VideoToolbox), Ollama 0.33.3 +
`qwen3.5:9b`. X5 card at `/Volumes/Insta360 X5/DCIM/Camera01` (41 `.insv` + `.lrv`, 92.5 min, all curated;
**77 moments** since Phase 7). Photo test root `/tmp/pf-photos` (13 photos + one synthetic `.insp`). Both
registered. Cache after the Phase-7 whole-card run: 404 files, 2.85 GB, 0 orphans, 0 unrecognised.

## 2. What exists

Phases 1–6 are documented in `docs/handoff/DONE.md` and the per-phase files. Phase 7 added:

### Server
- **Model-lane CPU bound (§3.1).** `OllamaProvider` takes `threads` (from the active `ResourceBudget`) and
  sends it as `options.num_thread` on every request (`chat()` — covers gradeFrame, describeImage,
  writeJson). Plumbed through `createProvider`/`createProviderForKind`; `handleCurate`, `handlePan360`
  and `planStory` pass `budget.threads`. Ollama 0.33.3 honours it per request (llama-server launches with
  no `--threads` flag; the effect is measurable and dose-dependent — see numbers). Settings "Performance"
  card copy now says the cap bounds ffmpeg **and** the local model.
- **Second moment for short clips (§3.2).** `selectPeaks` (highlights.ts): a clip capped at one moment
  (`highlightCap` < 225 s) keeps a second candidate when it is ≥ `minGapSec` (20 s) from the top pick and
  scores ≥ `SECOND_MOMENT_SCORE_RATIO` (0.85) × top. Pure, asserted; caps ≥ 2 are untouched.
- **Keep-the-pan + planet rotation (§3.3).** `setHighlightView(itemId, n, view, { keepPan, planetRotationDeg })`:
  with `keepPan` and a real pan (viewPath ≥ 2), the whole keyframe path shifts by the delta the user
  applied to the peak view, `clampPath` → `simplifyPath` → `panDecision` decide whether it stays a pan;
  otherwise it collapses to a static view exactly as before. `planetRotationDeg` (±180°, snapped to 15° by
  the route) is stored on the window (`HighlightWindow.planetRotationDeg?`, absent = 0 — **owner-approved
  schema addition**) and applied in `renderTinyPlanetProxy` as v360 `yaw` before the −90° pitch (rorder
  ypr → in-plane spin). PUT body validated: lens/yaw/pitch clamped, keepPan boolean, rotation snapped.
- **Yaw-editor frames named by time (§3.5).** `viewFramePath(itemId, atSec, lens, yaw, pitch)` →
  `cache/thumbs/<id>-view-<t.toFixed(1)>-<lens>-<yaw>-<pitch>.jpg`. The frame route accepts `?t=`
  (validated inside the window ± `HIGHLIGHT_FRAME_MARGIN_SEC` 0.5, exported from record.ts; default is the
  window's `sampleT`). Frames survive re-analysis: `removeCuration` no longer deletes them
  (`removeViewFrames` is gone) — the GC owns cleanup. `classifyArtifact` knows the new form
  (`owner: 'frame'` with `t`) and the legacy `-hl-<n>-view-` form (`owner: 'obsolete'`, always orphaned).
  `isOrphan` for frames: owned when `t` falls inside any window ± margin **or at a window's `sampleT`**
  (refinement can move a window off its sampled second — found live: sampleT 0, window 1–5). `KnownState`
  gained `windowSpans(itemId)` (start/end/sampleT per window).
- **Stale errors clear (§3.5).** `setStep`/`patchItem` (index-store.ts): when a step transitions to
  `ready` and no step remains `failed`, `LibraryItem.error` clears (`settleError`). An explicit `error`
  in a patch always wins. `VID_…040.insv`'s Phase-1 message is gone; 0 items carry errors after the run.

### Browser
- **ReframePanel (§3.3).** Panning moments show a three-frame strip (start/peak/end of `viewPath`, via the
  frame route's `?t=`) that live-updates with the sliders (delta applied to the path, clamped like the
  server), plus a "Keep the pan / Static view" pill radiogroup (default: keep; switching to static is a
  change by itself). Moments with a planet clip get a "Planet spin" slider (±180°, 15° steps; rotation-only
  changes enable Apply). Apply waits for flat + (kept) pan + (spun) planet, then hands back versioned URLs
  (pan clip preferred when kept).
- **Export Cancel (§3.4).** One `AbortController` per export; "Cancel export" button during
  preparing/rendering/encoding. The signal threads through `renderSlotFramesToFFmpeg` /
  `…WithSource` / `renderTransitionFramesToFFmpeg` / the fade loop / `loadMediaImage` /
  `loadSplitScreenComposite`; `seekToTime(video, t, timeoutMs, signal?)` and
  `writeFrame(…, signal?)`/`withTimeout(…, signal?)` reject immediately on abort (`AbortError`).
  Cancel during encoding calls `resetFFmpeg()` (worker `terminate()` + singleton reset — the only way to
  interrupt `exec`). After a cancel: `cleanupFS`, status → idle, dismissible notice "Export cancelled —
  nothing was saved." Render failures now carry context: "Export failed at slot 5 of 12 (IMG_x.jpg)
  (frame 132): …" (transitions and fade-out too; cancellations pass through unwrapped).
- **Template edits reach the export (§3.4).** `expandTemplateForMedia` stamps `baseIndex = i % baseCount`
  on every cloned slot (`TemplateSlot.baseIndex?` — runtime-only; projects persist template **ids**).
  `overrideForSlot(overrides, slot, slotIndex)` (templates.ts) maps text overrides: patches/removals of a
  base overlay follow every clone that kept that overlay; user-added overlays apply only at the base
  occurrence; clones whose text the expansion dropped stay silent. Used by all export draw paths and the
  preview text overlay in RenderStep.

### Verified numbers (Phase 7)
- **§3.1 measurement, 5 clips (004/005/008/022/025, ≈650 s footage, 165 grades each run,
  `ps -o pcpu` of llama-server sampled 1/s):**

  | profile (num_thread) | cores while busy (mean / p95 / peak) | s per grade | wall |
  |---|---|---|---|
  | before — no option (Phase 6 behaviour) | 5.5 / 8.2 / 8.7 | 1.32 | 260 s |
  | quiet (2) | 0.6 / 0.6 / 0.6 | 1.38 | 272 s |
  | balanced (4) | 1.0 / 1.3 / 1.4 | 1.37 | 270 s |
  | fast (8) | 1.7 / 2.7 / 2.8 | 1.36 | 259 s |

  Identical work each run (165 graded / 40 reused / 5 moments). The unbounded default was ~5 cores of
  thread-pool spin; bounding costs ≤ 5 % latency. Generation runs on Metal — the CPU burst was the vision
  encoder's pool.
- **Whole card, forced re-analysis of all 55 items (balanced): 2,363 s wall (39.4 min), 174 jobs done,
  0 failed, 0 cancelled.** llama-server across the whole run: mean 1.00 / p95 1.3 / peak 1.4 cores busy
  (2,166 one-second samples). `pmset -g therm`: **40/40 one-minute samples clean** (no CPU speed limit).
  load1 ranged 8.2–15.9 (Phase 6 saw 13–46 with a VM running; not directly comparable).
- **§3.2 on the card: 77 moments (was 51). 26 short clips gained a second moment** (handoff §3.2 estimated
  10–15; the 15 %-of-top rule admits more because fused scores cluster at 0.6–0.7). Eye check of three
  second-moment clips: VID_005 hl1 (cathedral ticket turnstile — genuinely strong), VID_013 hl1 (busy
  Prague square — good), VID_041 hl1 (stairwell selfie at the 0.857 boundary — marginal but defensible).
  Auto-pick (8 slots): two-moment clips contribute their **stronger** moment, or the more diverse one on an
  exact tie (0.7/0.7) — never a weaker-over-stronger pick. 77/77 flat clips, 40 pans, 77/77 planets
  rendered; 3/3 remembered user views restored exactly.
- **§3.3 round-trips (browser, dev server):** keep-the-pan with −10° yaw: strip updated (end keyframe
  clamped at −45 exactly like the server), Apply → flat+pan+planet re-rendered, record shows the shifted
  path, **31 s**. Static-view apply on a 3-keyframe pan: path collapsed to one keyframe, `panProxy`
  cleared. Planet spin +90°: `planetRotationDeg: 90` persisted, planet clip re-rendered, frames show an
  exact quarter-turn; the kept pan was untouched by the rotation-only apply.
- **§3.4 export (12 media → 12 slots, Cinematic Journey, 50 s timeline, 720p, no music):** Cancel pressed
  at slot 12/12 → bounded waits rejected, virtual FS cleaned, idle + notice in ~17 s (the cleanup of
  ~2,100 written frames dominates; earlier cancels return faster). Full export completed in **245 s** →
  1280×720, 57.4 s MP4. A base-template slot-0 text edit ("PHASE SEVEN") **renders in the exported file**
  (verified from a decoded frame at t = 2 s).
- **§3.5:** 0 items with `error` after the run (VID_040's stale Phase-1 message cleared). Storage report:
  404 files / 2.85 GB, **0 orphaned, 0 unrecognised**; "Reframe previews" class shows the new
  time-addressed frames (7 files after QA). GC pure checks cover the new form, the legacy always-orphan
  form, and peak-frame ownership.
- Pure checks: **21 passing** (selectPeaks 6, gc 7, pan-shift 2, templates/overrides 5, user-views
  regression 1). `tsc` + `next build` pass (build 16 s). Browser QA at 375 / 768 / 1280 (dark; the app is
  dark-only by design): panel stacks cleanly at 375, strip stays 3-up; global 2 px gold
  `:focus-visible` ring confirmed on the new pill radios (forced via CDP; the harness cannot send a real Tab).

### NOT verified (say so in your report if you also cannot)
- **Gemini with a real key.** `cloudSession.active` stayed `false` — no key was pasted into Settings during
  Phase 7. To verify: Settings → Google Gemini → paste key → Test connection (expect "Connected: gemini ·
  gemini-3.5-flash-lite"), then Library → Re-analyse 1 selected clip and Write story; check the job finishes
  with `provider: gemini` in `/api/jobs` recent, the record's `provider` field, and that the dev log contains
  0 occurrences of the key (`redact()`).
- **A real X5 `.insp`.** Still only the synthetic dual-fisheye JPEG (Phase 6). Resolution/EXIF orientation,
  lens order and APP segments of a camera-written file remain unverified.
- **Photos library happy path.** `photosLibrary: { found: true, readable: false }` — Full Disk Access is
  still not granted to the launching app. Grant in System Settings → Privacy & Security → Full Disk
  Access, restart the dev server, then "Add Photos Library" in the Library panel.
- **Ollama version dependence.** The `num_thread` lever is proven on Ollama 0.33.3; a future Ollama that
  ignores per-request `num_thread` would silently lose the bound — re-measure after Ollama upgrades.

### Known gaps
- **Second-moment quality bar.** The 15 % rule admitted 26 extras; the weakest eye-checked one sat exactly
  at the boundary. There is no absolute floor — a clip whose top moment is weak (e.g. 0.42) can gain an
  equally weak second. Whether that needs an absolute score floor is an owner-taste call (§3.1).
- **Hand-kept pans and planet spins do not survive re-analysis.** The user-view memory
  (`<id>.views.json`) stores only `{start, end, view}`; `applyRememberedViews` restores a *static* view,
  dropping a kept pan and any `planetRotationDeg`. Extending the memory is a schema change (§3.2, ask).
- **Cancel latency near the end of a render.** Abort is immediate, but `cleanupFS` deletes written frames
  one at a time (~17 s at 2,100 frames). Terminating the worker instead would free everything instantly at
  the cost of a core reload on the next export (§3.3).
- Unstabilised source tilt shows in reframes: when the camera was carried tilted, flat/pan renders tilt
  with it (seen at VID_005 28–32 s tail). Pre-existing; horizon-levelling from gyro data is a large feature.
- Split-screen slots injected by expansion still drop base text overlays (deliberate "too busy" rule);
  user-added text on such a base slot draws with default styling, not the base overlay's.
- `renderSlotToCanvas` / `renderTransition` in RenderStep.tsx are dead code (the preview uses the engine
  loop + JSX text); left untouched in Phase 7.
- GC is on-demand (Settings) only; no automatic sweep at boot or after a root is removed.
- `.cursor/` (owner's editor rules) is untracked in git; left as found.

## 3. Phase 8 scope — moment quality, durable edits, cancel polish

Goal: make the new second moments trustworthy, make hand edits (kept pans, planet spins) as durable as
hand-set views already are, and finish the export-cancel ergonomics. Every item is measured on the X5 card
before it is called done.

### 3.1 A quality bar for second moments (measure first)
- Fact (Phase 7): 26 of 35 eligible short clips gained a second moment under the 15 %-of-top rule; spot
  checks found one boundary case that a human would cut. Low-scoring clips can currently double weak
  moments (e.g. VID_032, top 0.21).
- Measure the distribution first: for all 26 second moments, tabulate top score, runner-up score, margin,
  and the runner-up's `grade.interest`. Propose and implement a floor (e.g. second moment requires fused
  score ≥ 0.5 or interest ≥ 5 — pick from the data, with asserts), then re-curate the card and eye-check
  every second moment that survives near the floor. Definition of done: a table before/after, the floor
  justified from the data, Auto-pick unaffected for top moments.

### 3.2 Hand edits survive re-analysis (ask before the schema change)
- Extend the user-view memory (`cache/analysis/<id>.views.json`, `UserViewMemory`) so a remembered entry
  can carry `viewPath?: ViewKeyframe[]` (a kept pan, in window-relative time) and `planetRotationDeg?`.
  **This is a schema change — ask, then wait.** Version the file (1 → 2) and keep reading v1.
- `applyRememberedViews` restores a remembered pan by re-anchoring the path onto the new window (clamp,
  simplify, panDecision — reuse the §3.3 Phase-7 pieces) and restores the planet spin. Pure functions +
  asserts; verify with a forced re-analysis of a clip carrying a kept pan and a spun planet.

### 3.3 Instant cancel
- Replace the frame-by-frame `cleanupFS` on cancel with `resetFFmpeg()` (terminate + reload next time) so
  cancel-to-idle is < 1 s regardless of progress; keep `cleanupFS` for the success path. Measure
  cancel-to-idle at early/mid/late cancel points. Confirm the next export still works after a terminate
  (core reloads from the CDN URL — note: first export after a cancel pays the reload).
- While there: surface the export's current slot in the progress card ("Rendering slot 5 of 12 — IMG_x.jpg")
  so the Cancel decision is informed.

### 3.4 Verify the owner-gated paths (when access is provided)
- Gemini with a real key, the Photos library after Full Disk Access, and a real `.insp` if one lands on
  the card — exact steps in §2 "NOT verified". Report honestly whatever remains unverified.

### 3.5 Hygiene
- Remove the dead `renderSlotToCanvas` / `renderTransition` functions from RenderStep.tsx (they drifted
  from the live code paths in Phase 7 and will rot).
- Consider a GC sweep after "Remove folder" (the one case that predictably strands hundreds of files) —
  policy question for the owner; ask before wiring it.

### 3.6 Safety
- No new lanes, no new concurrency. Any new memory-file field is versioned and validated on read. Every
  ffmpeg addition runs on the `ffmpeg` lane under the active budget; new request parameters are validated
  and clamped.

### 3.7 Definition of done
- §3.1 measured table + floor decision; card re-curated with 0 failed jobs and clean `pmset -g therm`.
- §3.2 (if approved): kept pan + planet spin survive a forced re-analysis, shown on one real clip.
- §3.3: cancel-to-idle < 1 s at three cancel points; a post-cancel export completes.
- `tsc` + `next build` pass; browser QA at 375 / 768 / 1280; pure checks extended; write `PHASE-9.md`.

## 4. How to run
```
npm run dev              # http://127.0.0.1:5190 (localhost-only by design)
npx tsc --noEmit -p tsconfig.json
npx next build           # stop the dev server first, then npm run dev again
```
Settings page: http://127.0.0.1:5190/settings (Storage card at the bottom). App data:
`~/Library/Application Support/PhotoForge` (safe to delete; media is never touched).

## 5. Pure-module check recipe (used in Phases 2–7)
`/tmp/pf8/tsconfig.test.json` extends the repo tsconfig with `noEmit:false`, `outDir:/tmp/pf8/build`,
`rootDir:<repo>/src`, `module:commonjs`, `moduleResolution:node`, `target:es2020`, `incremental:false`,
`plugins:[]`, and includes `src/server/**`, `src/types/**`, `src/lib/video-frame-extractor.ts`,
`src/lib/mp4-encoder.ts`, `src/lib/templates.ts` (Phase 7 added templates.ts for the override-mapping
checks). The test file installs a `Module._resolveFilename` shim mapping `@/…` to the build dir, falls
back to `<repo>/node_modules` for bare imports, and stubs `@ffmpeg/ffmpeg` / `@ffmpeg/util` (the UMD build
cannot load in Node). Run with `PHOTOFORGE_DATA_DIR=/tmp/pf8/data` so path helpers never point at the real
app data. Recreate as needed; never commit it.
