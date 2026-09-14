# PhotoForge — Phase 10 handoff (timeline integrity, honest stale references, responsive header)

You are continuing a multi-phase build. Phases 1–9 are complete and verified on real footage. This document
is the single source of truth for what exists, what is proven, and exactly what Phase 10 must deliver. When
Phase 10 is done, write `docs/handoff/PHASE-11.md` in this same format (what shipped, verified numbers,
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
footage special, Phase 6 hardened the cache/exports, Phase 7 disciplined the model lane, Phase 8 gave
second moments a quality floor and made hand edits durable, and Phase 9 made saved projects keep pointing
at the same footage through re-analysis, gave the export error path a clean slate, and pinned grading so
re-runs reproduce.

Machine: Mac Studio M3 Ultra (32 cores), macOS 26.6.2, ffmpeg 7.1.1 (VideoToolbox), Ollama 0.33.3 +
`qwen3.5:9b`. X5 card at `/Volumes/Insta360 X5/DCIM/Camera01` (41 `.insv` + `.lrv`, 92.5 min, all curated;
**74 moments** after the Phase-9 pinned re-baselining — see §2). Photo test root `/tmp/pf-photos`
(13 photos + one synthetic `.insp`). Both registered. Cache after the Phase-9 run + QA: 389 files,
2.78 GB, 0 orphans, 0 unrecognised, 0 items with errors.

## 2. What exists

Phases 1–8 are documented in `docs/handoff/DONE.md` and the per-phase files. Phase 9 added:

### Server
- **Stable window indices across re-analysis (§3.1).** A window's `index` is the identity everything
  outside the record points at (project ids `lib-<id>-hl<n>`, story keys `<id>#<n>`, clip/thumb
  filenames), but `curateVideo` numbers windows by fresh score order, which grade drift reshuffles.
  Now: the force path (`analyseItems`) removes artefacts + partial grades but **keeps the record json on
  disk** (`removeCurationArtifacts` in record.ts) as the identity anchor; after `curateVideo` builds the
  new record, `handleCurate` calls `inheritHighlightIndices` (user-views.ts — same greedy max-overlap
  matching and `MIN_OVERLAP_SEC` as the view memory): each new window inherits the index of the previous
  window it overlaps most; unmatched windows take the lowest unclaimed indices, so indices stay in 0..7
  and `removeCuration`'s cleanup loop stays valid. Array order (score order) is untouched — `highlights[0]`
  is still the top. Sparse-index consumers fixed: `highlightReady` (select.ts) resolves by `index` field,
  the GC judges highlight artefacts by index membership (`highlightIndices` set) instead of `< count`.
  `removeCuration` (full removal incl. record) is now uncalled — kept, flagged for deletion with approval.
- **Pinned grading (§3.3).** `gradeFrame` requests now send `temperature: 0, seed: 42` (`GRADE_SEED`,
  ollama.ts) via a `deterministic` flag on the private `chat`; story writing (`writeJson`) and
  `describeImage` stay at temperature 0.1 so "Regenerate" keeps variety. The grade retry appends a suffix,
  so pinning cannot replay the same invalid answer.

### Browser
- **Saved moments re-resolve on project load (§3.1).** The pre-Phase-9 loader rebuilt every library video
  as the *whole-video proxy* URL — a saved 360 moment (`lib-<id>-hl<n>`, clip-relative trims) silently
  played the wrong footage on load, even without re-analysis (shown live before fixing). Now
  `loadProject` (project-manager.ts) fetches item + curation once per referenced clip, finds the window
  by index and rebuilds the MediaFile through the same `montagePickToMediaFile` a fresh auto-pick uses
  (clip vs proxy readiness, pan/planet URLs — planet URLs previously didn't survive a save at all —
  `?v=` view version). Saved trims are kept when the clip-vs-proxy mode is unchanged (the user may have
  hand-trimmed; clamped to the clip), rebuilt when the mode flipped. If the record or window is gone, the
  item keeps the moment's own clip URL — a visible 404 rather than silently playing other footage.
- **Export failures leave a clean slate (§3.2).** The non-abort catch in RenderStep.tsx now calls
  `resetFFmpeg()` (worker terminate) before showing the unchanged error card, so a failed run's frames
  can never be muxed into the next export's `frame_%06d.jpg` sequence. Dead `holdFrames`/`drawCover`
  deleted (approved).

### Verified numbers (Phase 9)
- **§3.1 gap shown live (pre-fix):** project with 20 auto-picks saved; on reload, moment
  `lib-89793be…-hl1` ("VID_…020.insv · 0:30", trims 0.5–4.5 s clip-relative) got
  `url=/api/media/…/stream?variant=proxy` — the whole 44.9 s proxy ("0:45 total" in the trimmer,
  playing the clip's opening instead of the 0:30 moment). Post-fix: same saved project resolves to
  `/highlight/1/stream`, 5.04 s clip, "0:05 total". The score-reorder variant of the gap is forced in a
  pure check (fresh score sort renumbers 30–34 s from hl1 to hl0).
- **§3.3 variance (measured before wiring).** Same JPEG, 3 calls each. Unpinned (temp 0.1): bright frame
  — 2 distinct captions; dim tunnel frame — 3 distinct outputs including `quality` flipping dark↔ok and
  `faces` true↔false (the exact mechanism of Phase 8's 0.42↔0.6 fused-score drift: non-ok quality applies
  the 0.7 penalty on technically-weak seconds). Pinned (temp 0, seed 42): byte-identical 3/3 on both
  frames, and reproduced exactly after other requests ran in between. App-level: 3 forced re-analyses of
  VID_…020 pinned → identical records (grades, windows, captions, views); the later whole-card record for
  that clip is field-identical to the standalone runs. Ollama's server log shows `temp = 0.000` received.
- **Whole card, forced re-analysis of all 55 items (balanced): 2,674 s wall (44.6 min), 174 jobs,
  0 failed, 0 cancelled.** `pmset -g therm`: 42/42 one-minute samples clean. llama-server: mean 0.60 /
  p95 1.24 / peak 1.33 busy cores (1,524 one-second samples covering the last ~25 min — the sampler had
  a bug for the first ~19 min; thermal sampling covered the whole run) — the Phase-7 `num_thread` bound held.
- **§3.1 after the whole-card force:** all 8 saved project references resolve to the same footage with
  identical spans; trims still align (trimmer re-check on hl1: same URL shape, same 5.04 s clip). Window
  identity: 68 of 75 windows kept their index on the same footage (39 byte-identical span+score+caption;
  the rest shifted sub-second under pinned re-grading), 1 window vanished (75→74), and 6 windows were
  genuinely replaced — old footage has zero overlap with any new window because pinned grading picked
  different peaks. That is the expected one-time re-baselining of switching to pinned grades; their
  retired indices were reused by the new moments (documented residual, below).
- **§3.3 second-moment table after pinning (cap-1 clips only — the floor's domain):** 23 second moments
  (was 24), min runner-up 0.55, every one ≥ 0.5 absolute floor and ≥ 85 % of its top. The 0.42↔0.6 gap
  survives: sub-0.5 runner-ups exist only on cap≥2 long clips where the floor never applied.
- **§3.2 forced failure:** IMG_08's image URL blocked mid-export (20 slots, 720p) → "Export failed at the
  transition into slot 18 (IMG_08.jpg) (frame 2418): Failed to load media: IMG_08.jpg" — slot, media and
  frame still named. Next export in the same session (8 items): 37.2 s = exactly 1,116 frames, matching
  the clean-worker control with the identical 8-slot/32 s expansion (also 1,116). Without the reset the
  stale frames 1,116–2,417 would have muxed in (≈80.6 s output). Export throughput at 720p: 8 slots
  174 s wall / 37.2 s video; 20 slots 345 s wall / 82.6 s video.
- **Pure checks:** 14 pass (index inheritance incl. the forced reorder, tie-breaks, retired-index reuse,
  0..7 bound; sparse-index `highlightReady`; GC membership rule; view-memory matching regression).
- `tsc` + `next build` pass (build ~19 s). Browser QA (dark-only by design): 375 clean (trimmer stacks,
  header collapses to the step chip), 1280 clean (settings + Storage card), 2 px gold `:focus-visible`
  ring confirmed on the profile pills (forced via CDP, as in Phase 8). At exactly 768 the header
  overflows horizontally (≈860 px wanted) — pre-existing, no Phase-9 layout change touched it; see gaps.
  Storage after everything: 389 files / 2.78 GB, 0 orphans, 0 unrecognised; 0 items carry errors.

### NOT verified (say so in your report if you also cannot)
- **Gemini with a real key.** `cloudSession.active` stayed `false` all phase. To verify: Settings →
  Google Gemini → paste key → Test connection, then Re-analyse 1 clip + Write story; check
  `provider: gemini` in `/api/jobs` recent and the record, and 0 occurrences of the key in the dev log.
- **A real X5 `.insp`.** Card still has only `.insv`/`.lrv`/`.bin`. Synthetic dual-fisheye JPEG remains
  the only `.insp` coverage.
- **Photos library happy path.** `photosLibrary: { found: true, readable: false }` — Full Disk Access is
  still not granted. Grant in System Settings → Privacy & Security → Full Disk Access, restart the dev
  server, then "Add Photos Library".
- **Ollama version dependence.** `num_thread` and the seed/temp-0 determinism proven on 0.33.3 only;
  re-measure after any Ollama upgrade.
- **Pinned determinism across Ollama restarts.** Same-process runs reproduce byte-identically; a re-run
  after an Ollama server restart was not explicitly measured (expected to hold — seed + temp 0).

### Known gaps
- **Expanded-template duration integrity (found in Phase 9 QA — user-visible).** When media count exceeds
  the base template, `template.totalDuration` does not equal the sum of the expanded slots: the Export
  step's Timeline card said "10s total • 20 slots" while the export actually produced 82.6 s; the preview
  loop, beat-sync/music fitting and the saved project's `totalDuration` all consume the same wrong number.
  (At 8 slots the label read 32 s vs 37.2 s real — that delta is just transitions+fade, which the label
  never included; the 20-slot case is a real inconsistency.) `expandTemplateForMedia` in templates.ts.
- **Header overflows at exactly 768 px.** The `hidden md:inline` step labels un-hide at the md breakpoint
  and push the header to ≈860 px → horizontal scroll at 768. Pre-existing (Phase 9 touched no layout).
- **Retired-index reuse (documented §3.1 residual).** When a moment genuinely disappears in a re-analysis
  (zero overlap with every new window), its index is reused by a new moment; a stale project reference
  then plays the new moment under the old URL. Preventing that needs retired-index tombstones in the
  record — a schema change (owner approval). With pinned grading, disappearances should now be rare
  (the Phase-9 whole-card run's 6 cases were the one-time unpinned→pinned re-baselining).
- **Stale references die silently.** If a referenced moment is gone, the loaded item's clip URL 404s: the
  slot shows the saved thumbnail (export falls back to a still for videos) with no explanation in the UI.
  Photos fail the export loudly; videos degrade silently to their poster (pre-existing resilience choice
  in `loadMediaImage`).
- **`removeCuration` is now uncalled** (the force path keeps the record). Kept for the complete-removal
  semantic; delete or re-wire only with owner approval.
- Unstabilised source tilt shows in reframes; horizon-levelling from gyro data is a large feature.
- Split-screen slots injected by expansion still drop base text overlays (deliberate "too busy" rule).
- GC sweeps on root removal and on demand; no boot-time sweep.
- `.cursor/` (owner's editor rules) is untracked in git; left as found.

## 3. Phase 10 scope — timeline integrity, honest stale references, responsive header

Goal: make the numbers the user sees about their montage true (label, preview, music fitting, saved
duration), make a dead moment reference visible instead of silent, and clear the two smallest debts
(768 px header, `removeCuration`). Every item is measured before it is called done.

### 3.1 Expanded-template duration integrity (verify first, then fix)
- First show it live: load ≥ 16 media into a template, note the Timeline card total, the preview loop
  span, and the exported MP4 duration (Phase 9 measured 10 s label vs 82.6 s export at 20 slots).
- Fix at the source: `expandTemplateForMedia` must return a template whose `totalDuration` equals the
  sum of its expanded slot durations (decide explicitly how transitions and fade-out count, and make the
  preview loop, Timeline card and export agree on that definition). Check every consumer of
  `totalDuration`: preview loop (RenderStep), Timeline card, beat-sync/music fitting (MusicStep,
  beat-detect), story pacing if it reads it, and the saved project's `totalDuration`.
- Definition of done: label, looped preview span and `ffprobe`-measured export duration agree (± the
  documented transition/fade definition) at 6, 12 and 20+ media; existing saved projects still load.

### 3.2 Honest stale references
- When `loadProject` finds a referenced moment gone (no record window under that index — the Phase 9
  fallback path), surface it: the tile shows a visible "moment no longer exists" state instead of a
  quietly-404ing clip, and the export skips or errors loudly (owner's preference — ask once with a
  recommendation) rather than silently rendering the poster still.
- While in there, decide with the owner whether retired-index tombstones (record schema v2) are worth it
  now that pinned grading makes disappearances rare — **ask, then wait**; do not change the record format
  without approval.

### 3.3 Responsive header at 768
- Fix the ≈860 px header so 768 px has no horizontal scroll (move the md: reveal up to lg:, or tighten
  the nav). QA at 375 / 768 / 1280 again, with and without a loaded project name.

### 3.4 Verify the owner-gated paths (when access is provided)
- Gemini with a real key, the Photos library after Full Disk Access, and a real `.insp` if one lands on
  the card — exact steps in §2 "NOT verified". Report honestly whatever remains unverified.

### 3.5 Safety
- No new lanes, no new concurrency, no new npm dependencies. Any record or project-file format change is
  a schema change — ask, then wait. Keep verification scripts in `/tmp`, never in the repo.

### 3.6 Definition of done
- §3.1: agreement shown at three media counts with `ffprobe` numbers; pure checks for the expansion math.
- §3.2: a project referencing a deleted moment shows the stale state visibly; behaviour on export decided
  with the owner and implemented.
- §3.3: no horizontal scroll at 768 (or 375/1280 regressions).
- `tsc` + `next build` pass; browser QA at 375 / 768 / 1280; pure checks extended; whole-card run clean
  (`pmset -g therm`, 0 failed jobs) if re-analysis was forced; write `PHASE-11.md`.

## 4. How to run
```
npm run dev              # http://127.0.0.1:5190 (localhost-only by design)
npx tsc --noEmit -p tsconfig.json
npx next build           # stop the dev server first, then npm run dev again
```
Settings page: http://127.0.0.1:5190/settings (Storage card at the bottom). App data:
`~/Library/Application Support/PhotoForge` (safe to delete; media is never touched).

## 5. Pure-module check recipe (used in Phases 2–9)
`/tmp/pf10/tsconfig.test.json` extends the repo tsconfig with `noEmit:false`, `outDir:/tmp/pf10/build`,
`rootDir:<repo>/src`, `module:commonjs`, `moduleResolution:node`, `target:es2020`, `incremental:false`,
`isolatedModules:false`, `plugins:[]`, and includes `src/server/**`, `src/types/**`,
`src/lib/video-frame-extractor.ts`, `src/lib/mp4-encoder.ts`, `src/lib/templates.ts`. The test file
installs a `Module._resolveFilename` shim mapping `@/…` to the build dir, falls back to
`<repo>/node_modules` for bare imports, and stubs `@ffmpeg/ffmpeg` / `@ffmpeg/util` (the UMD build cannot
load in Node). Run with `PHOTOFORGE_DATA_DIR=/tmp/pf10/data` so path helpers never point at the real app
data. Recreate as needed; never commit it.
