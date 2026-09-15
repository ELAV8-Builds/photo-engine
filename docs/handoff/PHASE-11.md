# PhotoForge — Phase 11 handoff (full-quality whole-clip playback, animated splits, location-aware stories)

You are continuing a multi-phase build. Phases 1–10 are complete and verified on real footage. This
document is the single source of truth for what exists, what is proven, and exactly what Phase 11 must
deliver. When Phase 11 is done, write `docs/handoff/PHASE-12.md` in this same format.

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
- **Video plays at 1× or not at all (owner directive, 2026-09-15).** Never speed up, never slow down,
  never show a frozen frame of a video during motion. Every video slot owns its own real-time window of
  its source (`fitSlotsToFootage` in templates.ts): a 20-minute clip fills a 4-minute song as many
  distinct 1× pieces spread across the file; when footage runs short, slots shrink and the montage (and
  its music) simply ends earlier. Quality of imagery beats timeline length, always.

## 1. Product context

PhotoForge (Next.js 14, `src/`) builds montage videos from photos/videos with 12 templates, an effects
engine, in-browser preview and ffmpeg.wasm export. Phase 9 made saved projects keep pointing at the same
footage through re-analysis and pinned grading for reproducibility; Phase 10 (owner-directed scope) made
the timeline numbers honest, stopped videos freezing in split-screen slots, made the AI story the default
text layer, sped up long-clip grading on the fast profile, and fixed the 768 px header.

Machine: Mac Studio M3 Ultra (32 cores), macOS 26.6.2, ffmpeg 7.1.1 (VideoToolbox), Ollama 0.33.3 +
`qwen3.5:9b`. X5 card at `/Volumes/Insta360 X5/DCIM/Camera01` (41 `.insv` + `.lrv`; 74 moments, all
records balanced-quality and pinned-reproducible). Photo test root `/tmp/pf-photos`. Owner is actively
testing the app; the 20-item test project `9db40fee…` currently has 8 of 20 items selected (leftover from
Phase 9's §3.2 failure QA) — harmless, user-visible, may confuse ("where did my items go" = deselected,
not lost).

## 2. What exists (Phase 10 delta)

### Corrections to the Phase-10 handoff (fail loud)
- **The "10s total • 20 slots vs 82.6 s export" claim was mostly a QA artifact.** `formatDuration`
  renders "1m 10s" and the Phase-9 QA regex `\d+s total` ate the "1m ". The real defect was smaller but
  worse in consequence: `totalDuration` was the bare slot sum while the export **appends** transitions
  and fade (~5–13 s extra) — and because the music mix was rendered to the shorter number, `-shortest`
  **truncated the end of any export with music**. Fixed (below); the truncation fix is verified by
  construction and pure checks, **not by a live music export** (none run this phase).

### What shipped (all owner-approved 2026-09-14)
- **Timeline integrity.** `renderedDurationSec` (templates.ts) is the one definition of a montage's
  length: slot durations + each inter-slot transition (the *destination* slot's `transitionDuration`,
  matching `renderTransitionFramesToFFmpeg`) + fade-out. `expandTemplateForMedia` (both branches),
  `applyShotRoles` and `applyBeatSync` all use it, so the Timeline label, the preview loop, the music
  mix length and the saved project's `totalDuration` agree with the MP4. `EffectsEngine.calculateFrame`
  now gives transitions their own appended window exactly like the export (they used to overlap the slot
  tail); single-slot arrays — the export's own path — behave identically to before.
- **Videos never freeze in split-screen slots.** Split composites are drawn once per slot, so a video
  tile froze on its first frame — in the export too, not just preview. Now `assignMediaToSlots` gives
  split slots a photo primary, `getSlotMediaIds` fills split tiles from photos only, and with fewer than
  two photos the slot demotes to `single` in both preview and export, where videos actually play.
- **AI text is the default layer.** The story plan auto-writes when the Template step opens with
  library-backed shots (cached per shot list server-side; heuristic fallback; failures wait for
  Regenerate). New "Apply text only" puts the title/chapters on the *current* template without switching
  it or reordering shots; "Apply story" unchanged.
- **Fast-profile grading for long clips** (quiet/balanced untouched — verified byte-identical):
  `sampleBudget: 96` via `triageSampleTimes` (Stage-1-prior ranking with a one-per-60 s coverage floor),
  `maxViewPicks: 4` (weaker windows reuse the nearest picked view — measured ~2/3 of a long clip's fresh
  grades were view candidates), `dedupHamming: 8` on clips over 10 min. All three ride `CurateOptions`
  from `handleCurate`; nothing changes unless the profile is `fast` **and** the clip is long enough to
  hit the caps (≳8 min of usable footage).
- **Header fits at 768 px** (`hidden lg:inline` on the step/nav labels; was `md:`).
- **Stale moment references are visible.** `MediaFile.staleReference` set by the project loader's
  fallback; MediaStep shows a red "MOMENT MISSING" badge with guidance. Export behaviour unchanged
  (video falls back to its poster still).

### Verified numbers (Phase 10)
- Pure checks: 16 new (rendered duration math incl. export-frame-count agreement; engine window layout;
  splits photos-only/demotion/legacy; triage budget, coverage floor, determinism) + the 14 Phase-9
  checks still pass.
- **Balanced regression: byte-identical.** Forced re-analysis of VID_…020 on balanced after the speed
  changes produced a field-identical record (grades, windows, captions, views, stats) to the Phase-9
  pinned baseline.
- **Fast profile, 30-min clip (VID_…031, mostly static):** 226.8 s → 174.8 s (fresh grades 70 → 32);
  the residual is the single nice'd hardware-decoded ffmpeg sampling pass over 30 min of footage, which
  the model-side caps cannot reduce. **Honest boundary:** a 250 s clip (VID_…027) was unchanged
  (64 grades, 94.6 → 85.1 s ≈ noise) because it plans fewer samples than the budget — fast only bites
  above ~8 min. The card has no *busy* 10-min-plus clip, so the projected ~2.5–3× for that case is an
  estimate, not a measurement. Records for both test clips restored on balanced afterwards.
- **End-to-end export after all changes:** the 8-item Cinematic Journey selection labelled
  "37s total • 8 slots" exported to exactly 37.2 s / 1,116 frames (matches both Phase-9 controls);
  the label used to say "32s". Story auto-wrote on the Template step ("Echoes of Stone and Sky"),
  "Apply text only" kept the template and order.
- `tsc` + `next build` pass. QA 375 / 768 / 1280: no horizontal scroll anywhere (768 was the fix; 1280
  shows labels). Thermals: never above nominal all phase; model lane stayed within the Phase-7 bounds.

### NOT verified (say so in your report if you also cannot)
- **A live export with music** (the `-shortest` truncation fix is by construction + pure checks only).
- **The MOMENT MISSING badge live** — no stale reference exists in real data right now; code path +
  types only.
- **Fast-profile quality on a busy long clip** — no such clip on the card (see boundary above).
- **Split-slot photo content in decoded export frames** — verified by pure checks + identical frame
  count, not by eyeballing decoded frames.
- **Gemini with a real key / Photos library / real `.insp`** — still owner-gated, unchanged (Settings →
  key → Test; Full Disk Access then "Add Photos Library"; no `.insp` on the card). Owner was mid-FDA
  grant when Phase 10 was requested — System Settings was opened to the Full Disk Access pane; enable
  **Cursor**, restart the dev server, verify `photosLibrary.readable: true`.
- **Ollama version dependence** — everything measured on 0.33.3 only.

### Known gaps / deferred with designs (owner-approved deferrals)
- **Whole 360 clips in projects play the 720p LRV-derived proxy** (soft/grainy vs the 1080p INSV-based
  moment clips — the owner's main quality complaint). Deferred design: render `<id>-seg-<t0>-<t1>.mp4`
  at 1080p from the INSV **once, at export start** (never on trim drags — churn is exactly the
  "machine feels busy" failure), keyed by rounded trims, ffmpeg lane, GC-owned artifact class, browser
  polls readiness then swaps the export URL. Workaround today: build from auto-picked moments.
- **Split tiles are still stills** (photos only now, so nothing *freezes*, but a split never animates).
  Follow-up: per-frame composites in preview + export.
- **Location-aware stories.** exiftool is wired and available, but **no current media carries GPS**
  (checked .insv and all test photos — zero tags), so the feature was unverifiable and not built.
  Revisit when the Photos library (iPhone GPS) is readable: extract GPS at prepare (probe schema change
  — ask), offline nearest-city lookup from a small bundled list (no network by default — privacy), feed
  places into the story context.
- **Long-clip extraction pass** is now the fast profile's floor (~170 s of the 30-min clip): sampling
  extracts every 2 s frame before triage decides what to grade. Seek-based extraction of only the chosen
  times would cut it, but changes `extractSampleFrames`'s one-pass hash+frame design — measure first.
- **Retired-index reuse** (Phase 9 residual) and **record tombstones** — still needs a schema decision.
- **`removeCuration` uncalled** (since Phase 9); delete only with approval.
- Unstabilised source tilt (gyro horizon-levelling — large feature). `.cursor/` untracked; left as found.
- The preview's slot-position indicator appears to skip "1/N" at the loop wrap (cosmetic; found while
  verifying 10.2 — playback itself wraps correctly; cause: the update-on-change comparison closes over
  the mount-time state).
- **Preview video engineering notes (10.2 post-ship, all measured live).** Real bugs found and fixed:
  `getVideoElement` cached only after `loadeddata`, so a preview mounting many slots created a duplicate
  decoder per slot (4 per URL measured) — now an in-flight-promise cache; silent video→thumbnail
  fallbacks now `console.warn` (preview and export); preview stepping is event-gated (`gatedSeek`) —
  `video.seeking` is not a valid gate (it updates asynchronously, so rapid writes restart the seek
  forever and no frame is ever presented) and `play()`-driven preview was reverted (browsers throttle
  decode of "invisible" videos: clock advances, frames don't). Debug hooks `window.__pfPreview`
  (inspect/probe) and `window.__pfLastFrame` are deliberate keepers.

## 3. Phase 11 scope — full-quality whole-clip playback, animated splits, gated verifications

Goal: finish the two deferred quality items the owner already asked for, and close whatever
owner-gated verifications become available.

### 3.0 Signal-aware windows for whole clips (owner's "quality first", found 2026-09-15)
- `fitSlotsToFootage` spreads a whole clip's windows evenly across the file — which lands windows in
  dark/static stretches (measured: a window at 19.5–24.5 s of VID_…001 is near-black footage; hours were
  spent proving the *player* innocent). The server already knows the good seconds: curated highlight
  windows and Stage-1 per-second technical quality.
- Fix: when a whole video is in a project, snap its slot windows to its own curated highlight spans
  first (fetch the record like `loadProject` already does), then fill remaining appearances from
  technically-usable stretches; never place a window in seconds Stage 1 marks unusable.
- Definition of done: the VID_…001 repro (4 whole clips, Cinematic Journey) shows no near-black window;
  windows land on curated moments, verified by decoded frames.

### 3.1 INSV-quality segments for whole-clip project items (the churn-safe design above)
- New `segment` job on the ffmpeg lane + artifact `proxies/<id>-seg-<t0>-<t1>.mp4` (+ GC rule + route).
  Trigger at export start only; cache by (id, rounded trims); localhost API, id-addressed; validate and
  clamp t0/t1 against the probe. The preview keeps the fast proxy — only the export upgrades.
- Definition of done: an export containing a whole 360 clip visibly sharper than the proxy path
  (decode a frame and compare), export latency increase reported, zero re-renders while dragging trims.

### 3.2 Animated split-screen tiles
- Draw split composites per frame (videos seek like single slots) in preview and export; keep the
  photos-first assignment. Watch export throughput — N videos per split slot multiply seek work; measure
  and cap (e.g. max one video per split).
- Definition of done: a split slot with a video shows motion in a decoded export frame pair; export
  wall-time delta reported.

### 3.3 Verify what Phase 10 could not
- A live export **with music** long enough to prove the end is no longer truncated (duration equals the
  label; the final slots and fade are present).
- The MOMENT MISSING badge with a genuinely stale reference (force one by re-analysing after removing a
  moment's footage from disk copy — or accept and document that it needs real drift).
- Gemini key / Photos library (FDA) / real `.insp` when the owner provides access; after FDA also
  revisit location-aware stories (§2 design) — GPS-bearing media will finally exist.

### 3.4 Safety
- No new lanes or concurrency; the `segment` job shares the existing ffmpeg lane budget. Any record or
  project-file format change is a schema change — ask, then wait. Keep verification scripts in `/tmp`.

### 3.6 Definition of done
- §3.1 + §3.2 shown on real footage with decoded-frame evidence and measured export cost.
- §3.3 reported honestly, item by item.
- `tsc` + `next build` pass; pure checks extended; QA 375 / 768 / 1280; whole-card run clean if
  re-analysis was forced; write `PHASE-12.md`.

## 4. How to run
```
npm run dev              # http://127.0.0.1:5190 (localhost-only by design)
npx tsc --noEmit -p tsconfig.json
npx next build           # stop the dev server first, then npm run dev again
```
Settings page: http://127.0.0.1:5190/settings (Storage card at the bottom). App data:
`~/Library/Application Support/PhotoForge` (safe to delete; media is never touched).

## 5. Pure-module check recipe (used in Phases 2–10)
`/tmp/pf11/tsconfig.test.json` extends the repo tsconfig with `noEmit:false`, `outDir:/tmp/pf11/build`,
`rootDir:<repo>/src`, `module:commonjs`, `moduleResolution:node`, `target:es2020`, `incremental:false`,
`isolatedModules:false`, `plugins:[]`, and includes `src/server/**`, `src/types/**`,
`src/lib/video-frame-extractor.ts`, `src/lib/mp4-encoder.ts`, `src/lib/templates.ts`,
`src/lib/effects-engine.ts`, `src/lib/effects/**` (Phase 10 added the engine; call
`EffectsEngine.prototype.calculateFrame.call({}, …)` — the constructor needs a canvas, the timeline
math does not). The test file installs a `Module._resolveFilename` shim mapping `@/…` to the build dir,
falls back to `<repo>/node_modules` for bare imports, and stubs `@ffmpeg/ffmpeg` / `@ffmpeg/util`. Run
with `PHOTOFORGE_DATA_DIR=/tmp/pf11/data`. Recreate as needed; never commit it.
