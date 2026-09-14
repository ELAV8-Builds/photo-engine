# PhotoForge — Phase 9 handoff (moment identity, export error hygiene, reproducible grading)

You are continuing a multi-phase build. Phases 1–8 are complete and verified on real footage. This document
is the single source of truth for what exists, what is proven, and exactly what Phase 9 must deliver. When
Phase 9 is done, write `docs/handoff/PHASE-10.md` in this same format (what shipped, verified numbers,
known gaps, next scope) so a future window can pick the product up cold.

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
engine, in-browser preview and ffmpeg.wasm export. Owner's goals 1–6 are delivered; Phase 5 made 360
footage special (AI-directed pans, tiny planets, hand reframing), Phase 6 hardened the cache/exports,
Phase 7 disciplined the model lane and added second moments + pan/planet editing + export Cancel, and
Phase 8 gave second moments a quality floor, made hand edits durable across re-analysis, made Cancel
instant, and wired GC to sweep after a root is removed.

Machine: Mac Studio M3 Ultra (32 cores), macOS 26.6.2, ffmpeg 7.1.1 (VideoToolbox), Ollama 0.33.3 +
`qwen3.5:9b`. X5 card at `/Volumes/Insta360 X5/DCIM/Camera01` (41 `.insv` + `.lrv`, 92.5 min, all curated;
**75 moments** after the Phase-8 re-curation — see "grade drift" below). Photo test root `/tmp/pf-photos`
(13 photos + one synthetic `.insp`). Both registered. Cache after the Phase-8 run + QA: 401 files,
2.80 GB, 0 orphans, 0 unrecognised.

## 2. What exists

Phases 1–7 are documented in `docs/handoff/DONE.md` and the per-phase files. Phase 8 added:

### Server
- **Second-moment quality floor (§3.1).** `SECOND_MOMENT_MIN_SCORE = 0.5` (highlights.ts): a short clip's
  runner-up must clear the absolute fused score **and** the Phase-7 85 %-of-top ratio. Chosen from the
  measured distribution (26 second moments: three at 0.42 — all dark, quality-penalised clips whose top
  was equally weak — then an empty gap to a 0.6–0.7 cluster). Caps ≥ 2 untouched.
- **User-view memory v2 (§3.2, owner-approved schema 1 → 2).** `RememberedView` gained
  `viewPath?: ViewKeyframe[]` (a kept pan, keyframe times relative to the window start) and
  `planetRotationDeg?`. Writes are v2; v1 files still read; every new field validated/clamped on read
  (malformed v2 fields degrade to the v1 static-view meaning). `rememberedFromWindow(h)` builds the entry
  from a window's final state; `setHighlightView` now remembers **after** the pan-shift/spin decisions,
  and `rememberUserViewsFrom` (the force-re-analysis path) captures pans + spins from any user window.
  `anchorRememberedPath` re-anchors a remembered pan onto the new window (times scale proportionally onto
  the new span, then the planner's own clamp → simplify → panDecision decide pan vs static);
  `applyRememberedViews` restores pan (`panProxy: 'pending'`) and spin, or collapses to static exactly as
  before. `planViewPaths` already skips windows that have a `viewPath`, so a restored pan is never
  overwritten by the pan360 job.
- **GC sweep on root removal (§3.5, owner-approved).** `unregisterRoot` runs `clearOrphans()` after
  dropping the index and logs `sweptFiles`/`sweptBytes`. Manual GC in Settings unchanged.

### Browser
- **Instant cancel (§3.3).** The export's cancel path calls `resetFFmpeg()` (worker terminate — the
  virtual FS and all written frames die instantly) instead of deleting frames one at a time. `cleanupFS`
  remains on the success path only. The `framesWritten`/`ffmpegForCleanup` trackers that existed only for
  the old cleanup are gone. The next export after a cancel reloads the ffmpeg core (measured: included in
  the 225 s post-cancel export below).
- **Informed cancel (§3.3).** The progress card now names the slot's media:
  "Rendering slot 9 of 12 — VID_20260727_183829_00_041.insv".
- **Hygiene (§3.5).** Dead `renderSlotToCanvas` / `renderTransition` deleted from RenderStep.tsx (the
  preview uses the engine loop + JSX text; export uses the `…ToFFmpeg` functions).

### Verified numbers (Phase 8)
- **§3.1 measurement (before, all 26 second moments):** fused scores 0.42 ×3 / 0.60 ×19 / 0.65 ×1 /
  ~0.70 ×3; runner-up `grade.interest` ≈ 6 nearly everywhere (reconstructed by inverting `fuseCandidate`
  against the signals track; interest must land on an integer). The three 0.42s were the "weak top doubles
  a weak second" failure. Floors 0.45/0.5/0.55 are equivalent on this data; 0.5 chosen (mid-gap, blocks
  any second on a weak-top clip by construction).
- **Whole card, forced re-analysis of all 55 items (balanced): 2,570 s wall (42.8 min), 174 jobs, 0
  failed, 0 cancelled.** `pmset -g therm`: 47/47 one-minute samples clean. llama-server: mean 0.62 /
  p95 1.22 / peak 1.37 busy cores (2,573 one-second samples) — the Phase-7 `num_thread` bound held.
- **§3.1 after:** 24 second moments (was 26); the three weak-top clips now carry exactly one moment
  (VID_035 re-graded its top to 0.6 this run; VID_026/038 stayed 0.42). Every survivor ≥ 0.55. Eye check
  of the six nearest the floor (0.55, 0.59, four 0.6s): all genuine; VID_041's stairwell selfie is still
  the weakest — same "marginal but defensible" verdict as Phase 7. Auto-pick smoke: 8 picks from 55,
  videos contribute their stronger moment. 32 pure checks pass.
- **§3.2 on the real Phase-7 QA clip (VID_…005, window 28–32, kept pan 35→−45, spin 90°):** force
  captured v2 memory (relative path `[0: 35, 4: −45]`, rotation 90) → after re-curation the same window
  came back with the pan and spin restored **exactly** and all three clips re-rendered. A fresh UI apply
  (yaw −5°, spin 75°, keep pan) round-tripped: record shifted (end keyframe held at the −45° clamp),
  memory v2 updated, flat+pan+planet re-rendered.
- **§3.3 cancel-to-idle: 3 ms (slot 1), 3 ms (slot 6 of 12, ~900 frames), 2 ms (encoding 50 %,
  ~2,100 frames — was ~17 s in Phase 7).** Post-cancel export completed: 225 s, 12 slots, Cinematic
  Journey 50 s timeline, 720p, no music → 12.3 MB `video/mp4` (includes the core reload after terminate).
- **§3.5 GC sweep:** throwaway root (1 photo) registered → indexed → curated → removed: 2 stranded
  artefacts swept immediately (`sweptFiles: 2`), real roots untouched.
- `tsc` + `next build` pass (build ~19 s). Browser QA at 375 / 768 / 1280 (dark-only by design): reframe
  panel stacks cleanly at 375, strip stays 3-up, 2 px gold `:focus-visible` ring confirmed on the pill
  radios (forced via CDP). Storage after everything: 401 files / 2.80 GB, 0 orphans, 0 unrecognised;
  0 items carry errors.

### NOT verified (say so in your report if you also cannot)
- **Gemini with a real key.** `cloudSession.active` stayed `false` all phase. To verify: Settings →
  Google Gemini → paste key → Test connection, then Re-analyse 1 clip + Write story; check
  `provider: gemini` in `/api/jobs` recent and the record, and 0 occurrences of the key in the dev log.
- **A real X5 `.insp`.** Card still has only `.insv`/`.lrv`/`.bin`. Synthetic dual-fisheye JPEG remains
  the only `.insp` coverage.
- **Photos library happy path.** `photosLibrary: { found: true, readable: false }` — Full Disk Access is
  still not granted. Grant in System Settings → Privacy & Security → Full Disk Access, restart the dev
  server, then "Add Photos Library".
- **Ollama version dependence.** `num_thread` proven on 0.33.3 only; re-measure after any Ollama upgrade.

### Known gaps
- **Project references may not survive re-analysis (suspected, reasoned from code — not yet shown live).**
  A project stores a moment as `lib-<id>-hl<n>` plus trims, but `n` is the record's score-ordered window
  index, which a re-analysis can reshuffle (windows re-sort by fresh scores). A saved project could then
  stream a *different* moment under the same URL. The user-view memory (Phase 6/8) already solves identity
  by time overlap — project references need the same treatment.
- **Export error path leaves the virtual FS dirty.** A *failed* export (not a cancel — that now
  terminates) keeps the worker alive with its written frames; because ffmpeg reads `frame_%06d.jpg`
  sequentially, a subsequent shorter export could mux stale frames from the failed run into its output.
  Pre-existing (Phases 6–8); the cancel path is clean, the error path is not.
- **Grade drift across re-runs.** Identical forced re-analyses produce slightly different grades (77 → 75
  moments; one clip's top went 0.42 → 0.6; captions vary). Curation resumes from partials so this only
  shows on force. Worth pinning (Ollama `seed`/`temperature` request options) so measurements reproduce.
- `holdFrames` / `drawCover` in RenderStep.tsx are dead code (found in Phase 8, not approved for deletion
  then — approved by the Phase 9 prompt below).
- Unstabilised source tilt shows in reframes (VID_005 28–32 s tail); horizon-levelling from gyro data is
  a large feature.
- Split-screen slots injected by expansion still drop base text overlays (deliberate "too busy" rule);
  user-added text on such a base slot draws with default styling.
- GC sweeps on root removal and on demand; no boot-time sweep (nothing predictably strands files at boot).
- `.cursor/` (owner's editor rules) is untracked in git; left as found.

## 3. Phase 9 scope — moment identity, export error hygiene, reproducible grading

Goal: make a saved project keep pointing at the *same footage* through a re-analysis, make a failed
export leave nothing behind, and make grading reproducible enough that re-runs are comparable. Every item
is measured on the X5 card before it is called done.

### 3.1 Project references survive re-analysis (verify first, then fix)
- First **show the gap live**: save a project with auto-picked moments, force re-analysis of one of its
  clips whose two windows have close scores, and check whether `lib-<id>-hl<n>` now plays different
  footage. If indices happen to be stable on this card, force the reorder in a pure check.
- Fix by identity, not index: when a record is rebuilt, re-match saved project references onto the new
  windows by time overlap (reuse the `matchRememberedViews` pattern / `MIN_OVERLAP_SEC`). Decide where the
  mapping lives (server on record change vs. resolve-at-stream-time) and justify; the browser must never
  see filesystem paths, and existing project files must keep loading (any format change is a schema
  change — **ask, then wait**).
- Definition of done: a saved project plays the same moments before and after a forced re-analysis of its
  clips, shown on one real project; trims still align.

### 3.2 Export error-path hygiene
- On a render/encode *failure* (the catch that is not an abort), reset the worker (`resetFFmpeg()`)
  so no stale frames can leak into the next export's `frame_%06d.jpg` sequence. Keep the error card and
  message exactly as they are; the next export pays the core reload (same as after a cancel — measured
  225 s total in Phase 8, acceptable).
- Delete the now-approved dead `holdFrames` / `drawCover` in RenderStep.tsx.
- Verify: force a failure (e.g. a media URL that 404s mid-export), confirm the error message still names
  slot/media/frame, then run a full export and check duration/frame count of the output are exactly right.

### 3.3 Reproducible grading (measure, then decide)
- Investigate Ollama per-request `seed` + `temperature` options for `qwen3.5:9b` grading (same place
  `num_thread` rides — `options` on `chat`). Measure: re-grade one clip 3× with and without pinning;
  report grade/caption variance. If pinning works, wire it (constant seed, temperature 0) so forced
  re-analyses are comparable run-to-run; if it does not (API ignores it / vision path nondeterministic),
  report that honestly and leave the code untouched.
- Re-measure the §3.1 second-moment table once after pinning to confirm the floor still cuts the same
  clips (numbers may shift slightly; the 0.42 ↔ 0.6 gap should survive).

### 3.4 Verify the owner-gated paths (when access is provided)
- Gemini with a real key, the Photos library after Full Disk Access, and a real `.insp` if one lands on
  the card — exact steps in §2 "NOT verified". Report honestly whatever remains unverified.

### 3.5 Safety
- No new lanes, no new concurrency. Any project-file format change is versioned and validated on read.
  Every ffmpeg addition runs on the `ffmpeg` lane under the active budget; new request parameters are
  validated and clamped.

### 3.6 Definition of done
- §3.1: same-footage-after-re-analysis shown on a real project; pure checks for the re-matching.
- §3.2: a forced failure leaves a clean slate (next export byte-exact in frame count); dead code gone.
- §3.3: variance table with and without pinning; decision justified from the data.
- `tsc` + `next build` pass; browser QA at 375 / 768 / 1280; pure checks extended; whole-card run clean
  (`pmset -g therm`, 0 failed jobs) if re-analysis was forced; write `PHASE-10.md`.

## 4. How to run
```
npm run dev              # http://127.0.0.1:5190 (localhost-only by design)
npx tsc --noEmit -p tsconfig.json
npx next build           # stop the dev server first, then npm run dev again
```
Settings page: http://127.0.0.1:5190/settings (Storage card at the bottom). App data:
`~/Library/Application Support/PhotoForge` (safe to delete; media is never touched).

## 5. Pure-module check recipe (used in Phases 2–8)
`/tmp/pf9/tsconfig.test.json` extends the repo tsconfig with `noEmit:false`, `outDir:/tmp/pf9/build`,
`rootDir:<repo>/src`, `module:commonjs`, `moduleResolution:node`, `target:es2020`, `incremental:false`,
`isolatedModules:false`, `plugins:[]`, and includes `src/server/**`, `src/types/**`,
`src/lib/video-frame-extractor.ts`, `src/lib/mp4-encoder.ts`, `src/lib/templates.ts`. The test file
installs a `Module._resolveFilename` shim mapping `@/…` to the build dir, falls back to
`<repo>/node_modules` for bare imports, and stubs `@ffmpeg/ffmpeg` / `@ffmpeg/util` (the UMD build cannot
load in Node). Run with `PHOTOFORGE_DATA_DIR=/tmp/pf9/data` so path helpers never point at the real app
data. Recreate as needed; never commit it.
