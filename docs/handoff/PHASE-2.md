# PhotoForge — Phase 2 handoff (Local AI curation)

You are continuing a five-phase build. Phase 1 is complete and verified. This document is the
single source of truth for what exists, what is proven, and exactly what Phase 2 must deliver.
When Phase 2 is done, write `docs/handoff/PHASE-3.md` in the same format so the next window can continue.

## 0. Non-negotiables (apply to every phase)

- **Local-first and private.** Media never leaves this Mac unless the user explicitly enables the
  Gemini provider (Phase 4). Default provider is Ollama.
- **Never make the machine feel busy.** One job per heavy lane, `nice`d ffmpeg, hardware decode,
  bounded threads, model auto-unload. Measure before claiming.
- **Surgical changes.** Touch only what the phase needs. Match existing style. Don't refactor working code.
- **No new npm dependencies, env-file edits, port/URL changes, schema changes, or deletions
  without the user's explicit approval.** Node 20.19 (no `--experimental-strip-types`), so there is no
  in-repo TypeScript test runner today; verify with throwaway scripts under `/tmp` and browser QA.
  If you want vitest, ask first.
- **Fail loud.** Report anything skipped or unverified. Type-check (`npx tsc --noEmit -p tsconfig.json`)
  and `npx next build` must pass before you call a phase done. Stop the dev server before `next build`
  (they share `.next/`), then restart it with `npm run dev`.
- **Best practices:** typed boundaries, small pure functions, atomic writes, spawn with arg arrays
  (never shell strings), validate every request input, id-addressed media (browser never sees paths),
  localhost-only APIs, structured logging with redaction. No spaghetti.

## 1. Product context

PhotoForge (Next.js 14, `src/`) builds montage videos from photos/videos with 12 templates
(`src/lib/templates.ts`), an effects engine, in-browser preview and ffmpeg.wasm export. Owner's goals:
1. Point at whole library folders; the app decides which photos/video moments are best.
2. Mix videos and photos deliberately (every template slot is currently `slotType: 'any'` and
   `assignMediaToSlots` is round-robin — the type field is unused in assignment).
3. Insta360 X5 360° footage must become flat, watchable video (done in Phase 1 via ffmpeg `v360`).
4. Find the best 3–5 s moments inside long videos (up to 20 min) without "watching every frame".
5. Content-aware titles, chapters, template recommendation from a local model.
6. Gemini as an opt-in provider with a key entered in Settings (Phase 4).

Machine: Mac Studio M3 Ultra, 256 GB, macOS 26.6.2, ffmpeg 7.1.1 (VideoToolbox), Ollama 0.33.3 running
on `http://localhost:11434`, model `qwen3.5:9b` pulled (6.6 GB). exiftool, sips present.
The user's X5 SD card is mounted at `/Volumes/Insta360 X5/DCIM/Camera01` (41 `.insv` + paired `.lrv`).

## 2. What Phase 1 built (all verified on the real X5 card)

### Server (`src/server/**`, Node runtime only — `assertServer()` guards every module)
- `runtime.ts` — app data dir `~/Library/Application Support/PhotoForge` (override `PHOTOFORGE_DATA_DIR`),
  subdirs `state/`, `cache/{thumbs,renditions,proxies,analysis}`, `tmp/`, `logs/`; `writeJsonAtomic`,
  `globalSingleton` (HMR-safe process state).
- `log.ts` — scoped logger with secret redaction. `PHOTOFORGE_DEBUG=1` for debug lines.
- `maintenance.ts` — boot-time sweep of `*.<pid>.tmp*` files whose owner PID is dead; empties `tmp/`.
- `fs/safe-path.ts` — `validateRootCandidate` (absolute, exists, dir, realpath, forbidden system roots
  incl. `/private/etc`), `resolveWithinRoot`, `toRelPosix`.
- `settings/store.ts` — `performanceProfile: quiet|balanced|fast` (default balanced) → `budgetFor()` = `{nice, threads, signalFps}`
  (quiet: nice 19 / 2 threads / 1 fps; balanced: 15/4/2; fast: 5/8/2). Persisted `state/settings.json`.
- `media/binaries.ts` — tool discovery (`PHOTOFORGE_TOOLS_DIR`, Homebrew, PATH).
- `media/ffmpeg.ts` — `run()` (spawn + nice + AbortSignal + timeout + stderr tail + child tracking so
  server shutdown kills ffmpeg), `runFfmpeg(inputArgs, restArgs, opts)` (hwaccel before `-i`, `-threads`,
  progress from `time=`), `runFfprobeJson`.
- `media/probe.ts` — dims/duration/codec/audio; HEIC dims via `sips`; rotation-aware; capture time from
  exiftool (photos) / `creation_time` (videos).
- `media/reframe.ts` — v360 filter builders. **Layouts:** `dual-fisheye-streams` (.insv, lens A = stream 0),
  `dual-fisheye-sbs` (.lrv, lens A = RIGHT half). `flatViewFilter(layout, lens, view, size)`,
  `renderFlatProxy()` (H.264 VideoToolbox, `-allow_sw 1`, AAC). `DEFAULT_VIEW` = yaw 0, pitch 0, hFov 100, vFov 70.
- `media/thumbnails.ts` — `generateThumbnail` (≤512 px; videos 16:9 to match proxy; 360 uses the LRV),
  `ensureRendition(item, 1024|2048|4096)`, HEIC via sips→ffmpeg so pixels are upright and untagged,
  `proxyPath(id)` = `cache/proxies/<id>-flat720.mp4`, `imageDimensions()`.
- `analysis/signals.ts` — **Stage 1**: one ffmpeg pass → per-sample brightness (YAVG), scene score (motion/novelty),
  Sobel edge energy (sharpness), per-second audio RMS dB. Uses the LRV for 360 clips, crops lens A central 70 %.
  Output `cache/analysis/<id>.signals.json` (`SignalTrack`). ~27× realtime on LRV-sized input.
- `analysis/technical-score.ts` — pure functions: `computeTechnicalVerdict()` → per-second `usable`, `technical` 0–1,
  `audioEvent`, `novelty`. Thresholds calibrated on real footage (black frames = luma 3–5, blown-out doorway = 229–232 →
  `darkFloor 18`, `brightCeiling 230`, `shakeCeiling 0.45`, sharp floor = max(3, 0.35 × clip p75)).
- `library/registry.ts` (roots), `library/index-store.ts` (per-root JSON index, `IndexedItem` = DTO + `absPath`,
  `cameraProxyAbsPath`; `toDto` strips paths; `processing`→`pending` recovery on load), `library/scanner.ts`
  (walk, skip hidden/symlinks, Insta360 `VID_…_00_NNN.insv` ↔ `LRV_…_01_NNN.lrv` pairing, capture time from
  `YYYYMMDD_HHMMSS` in names, stable id = sha1(rootId, relPath, size, mtime)[:20]), `library/work.ts`
  (`planItemJobs`/`enqueueItemWork` — the one place that decides outstanding work), `library/service.ts`
  (bootstrap = register handlers + sweep + resume pending; root CRUD; `listItems`, `resolveItem`).
- `jobs/queue.ts` — lanes `ffmpeg:1`, `model:1` (reserved for Phase 2), `io:2`; priorities scan < prepare < proxy360 < signals;
  dedup by (type,itemId); pause/resume/cancel; snapshot. In-memory on `globalThis`; durable state is the item index.
- `jobs/handlers.ts` — `scan-root`, `prepare` (probe + capture time + thumbnail + EXIF orientation reconcile),
  `proxy360`, `signals`. Handlers are the only code that mutates item status.
- `http.ts` — `handle()` error mapping, `readJsonBody`/`requireString`, `serveFile()` with Range/206, ETag/304, nosniff.
- API: `GET/POST /api/library/roots`, `DELETE /api/library/roots/[id]`, `POST …/[id]/rescan`,
  `GET /api/library/items?rootId&kind&offset&limit`, `GET /api/library/items/[id]`,
  `GET /api/media/[id]/thumb|image?max=|stream?variant=original|proxy` (GET+HEAD),
  `GET/POST /api/jobs` (`{action: pause|resume|cancel, jobId?}`), `GET/PUT /api/settings`,
  `GET /api/system/capabilities`, `POST /api/system/pick-folder` (native macOS chooser via osascript).
- `src/middleware.ts` — loopback Host allow-list, rejects `Sec-Fetch-Site: cross-site`, Origin must be local for
  mutating methods. Matcher: `/api/{library,media,jobs,settings,system}/*`. `package.json` dev/start bind `-H 127.0.0.1`.

### Shared types
- `src/types/library.ts` — `LibraryRoot`, `LibraryItem` (+`FrameLayout`, `ItemStatus`, `MediaProbe`), `JobInfo`,
  `QueueSnapshot`, `ServerSettings`, `SignalTrack`/`TechnicalVerdict`, `SystemCapabilities`.
- `src/types/index.ts` — `MediaFile.file` is now **optional**; added `libraryItemId?`, `is360?`, `capturedAt?`.

### Browser
- `src/lib/library-client.ts` — typed API wrappers, `mediaUrl.{thumb,image,stream}`, `isItemUsable`,
  `libraryItemToMediaFile` (360 videos → proxy URL, 1280×720; photos → 2048 rendition).
- `src/components/LibraryPanel.tsx` — folders, native picker + manual path, activity strip with Pause/Resume,
  filter chips, tile grid with 360/duration badges and readiness states, select/add. Polls `/api/jobs`
  every 2 s while busy, 8 s idle. Face detection runs on the thumbnail and is scaled to render dims.
- `src/components/MediaStep.tsx` — mounts the panel; `addLibraryMedia` dedups by `libraryItemId`; grid prefers `thumbnailUrl`.
- `src/lib/project-manager.ts` — `toSavedMediaItem()`; library items are saved by reference (no blob copy) and
  re-resolved to server URLs on load. `SavedMediaItem.mediaBlob` is optional.
- `src/components/RenderStep.tsx` — the 501 server-render stub tolerates file-less media.

### Verified numbers (real X5 footage)
- Flat reframe 8K INSV → 1080p: ≈2.3× realtime with hardware decode; from LRV ≈40× realtime.
- Signals pass: 27.5× realtime (LRV, unthrottled). 67 s clip → 67 samples at 1 fps (quiet profile). Under the quiet budget (nice 19, 2 threads) a 720p proxy renders at roughly 1× realtime; balanced ≈ 2×, fast ≈ 4× — the profile trades import speed for footprint by design.
- Whole 41-clip card: thumbnails appear within ~1 min; proxies + signals complete in the background.
- Browser plays the proxy via Range requests: load 39 ms, seek to 30 s in 31 ms.
- `qwen3.5:9b` via `/api/chat` with `"think": false`, `"format": "json"`, temperature 0.1: **0.91 s per 512×288 frame**,
  100 % valid JSON over 17 frames, correct dark/blown-out/faces flags, sensible 10-word captions.
  **Grid/contact-sheet grading is unreliable on this model** (misread cells, invented indices, pattern-filled scores).
  Without `think:false` it spends the whole token budget thinking and returns empty content.
- Thermals: `pmset -g therm` recorded no warnings during any of it.

### Known gaps / notes for later phases
- Header (`src/components/Header.tsx`) overlaps the step nav at ~768 px — pre-existing, not touched.
- `MediaFile.trimStart/trimEnd` are honoured by preview/export already; Phase 2 sets them from highlights.
- Photos render from the 2048 rendition; for 4K export pick `image?max=4096` (Phase 3 or 5).
- Trim memory (`trim-memory.ts`) is keyed by File name/size and is skipped for library items.
- `.insp` photos are treated as ordinary JPEGs (no reframe yet).
- Cache GC (orphaned thumbs/proxies when files change/roots removed) not implemented.

## 3. Phase 2 scope — Local AI curation

Goal: for every library item, produce a **curation record**; for videos, a ranked list of highlight windows;
in the UI, scores and an "Auto-pick best N" that adds items (and video highlights as trimmed entries) to the project.

### 3.1 Model access (`src/server/ai/ollama.ts` + `src/server/ai/provider.ts`)
- Define `VisionProvider` interface: `gradeFrame(jpegPath|Buffer, ctx) → FrameGrade`, `describeImage`, `writeJson(prompt) → unknown`
  (text-only, for Phase 3). Implement `OllamaProvider` now; leave room for `GeminiProvider` (Phase 4).
- Ollama call shape (proven): `POST http://localhost:11434/api/chat` with
  `{ model, stream:false, format:"json", think:false, keep_alive:"5m", options:{ temperature:0.1, num_predict:160 }, messages:[{ role:"user", content, images:[base64] }] }`.
  Use `fetch` with `AbortSignal`, 120 s timeout, retry once on invalid JSON with a stricter reminder.
- Health: `GET /api/version`, `GET /api/tags` to detect the model; expose in `/api/system/capabilities` as `ollama: {running, models}`.
  Default model `qwen3.5:9b`; make it a server setting (`ServerSettings.visionModel`).
- **One inference at a time** — run all model work on the existing `model` lane.

### 3.2 Frame grading schema (`FrameGrade`)
```
{ "interest": 0-10, "quality": "ok"|"dark"|"blur"|"bright"|"blocked",
  "people": bool, "faces": bool, "scene": "3-6 words", "caption": "max 10 words" }
```
Prompt (validated): "One frame from a personal travel video. Return ONLY JSON: {…}. interest = how great this exact
moment would look in a fast travel montage; reward clear faces, action, scenery, good light." Use 512 px frames.
For photos grade the 512 px thumbnail directly.

### 3.3 Video highlight pipeline (`src/server/analysis/highlights.ts`, job type `curate`)
Stage 1 (`signals`) already exists — never grade a second where `perSecond.usable[s] === false`.
1. **Sample**: one frame every 4 s over usable seconds (denser, 2 s, where `novelty`/`audioEvent` fire; sparser, 6 s,
   in long static stretches). Extract with a single ffmpeg call using `select` + `fps` on the LRV/original at 512 px;
   for 360 sources extract the **dual-fisheye frame** (whole sphere in one image) via the LRV.
2. **Dedup**: perceptual hash (implement 8×8 DCT/average hash in pure TS from the JPEG via ffmpeg `-vf scale=16:16,format=gray -f rawvideo`);
   skip frames within Hamming distance ≤ 6 of the previous graded frame and reuse its grade.
3. **Grade** each remaining frame with `gradeFrame` (≈0.9 s each; a 20-min video ≈ 150–200 grades).
4. **Fuse** per candidate second: `score = 0.5·interest/10 + 0.15·(faces?1:people?0.6:0) + 0.15·motionScore + 0.1·audioEvent + 0.1·novelty`,
   `quality !== 'ok'` → drop. Then temporal non-max suppression (min gap = max(20 s, 5 % of duration));
   cap highlights at `clamp(round(duration/150), 1, 8)`.
5. **Refine** each highlight to a 3–5 s window: extract 2 fps for ±3 s (ffmpeg, no model), snap to the peak of
   `sharpness × motionScore`; store `{ start, end, score, caption, scene, people, faces, sampleT }`.
6. **360 yaw pick**: render 6 flat candidates (lens A yaw −60/0/60, lens B yaw −60/0/60) at the highlight's `sampleT`
   as one ffmpeg call each; grade; choose max `interest` (+0.1 if faces). Store `view: { lens, yawDeg, pitchDeg }`.
7. Persist `cache/analysis/<id>.curation.json` (`CurationRecord`, versioned) and add `status.curate` to `ItemStatus`.
   Photos: `{ grade, score }` only.

### 3.4 Highlight proxies
For each chosen 360 highlight, render a flat 1080p clip of just that window (+0.5 s margins) from the **INSV** with
`renderFlatProxy({ trimStartSec, trimDurationSec, view, size: 1920×1080 })` → `cache/proxies/<id>-hl-<n>.mp4`.
Expose `GET /api/media/[id]/highlight/[n]/stream`. Flat videos need no proxy (use `trimStart/trimEnd`).

### 3.5 Selection (`src/server/curation/select.ts`, pure)
`selectForMontage(items, records, { slots, videoRatio = 0.4, chronological = true })` → ordered list of
`{ itemId, highlightIndex? }` with diversity (no two highlights from the same clip adjacent, scene-tag diversity
by caption words), respecting readiness. Exposed via `POST /api/curation/select`.

### 3.6 UI
- Tile badges: score chip (e.g. `8.2`), "N highlights" for videos, "Analysing…" state; sort control (capture time | score).
- "Analyse library" button (enqueues `curate` for all items lacking a record) and per-item re-run.
- "Auto-pick best N" (N defaults to the selected template's `mediaCount`, or ~2× if unknown) → converts to `MediaFile[]`
  where video highlights become separate entries with `trimStart/trimEnd` (and `url` = highlight proxy for 360),
  `id` = `lib-<itemId>-hl<n>`. Dedup on that id in `MediaStep.addLibraryMedia`.
- Keep all existing manual controls; the user can always override.

### 3.7 Safety
- `curate` runs on lane `model` at the lowest priority; frame extraction it needs runs inline in the same handler
  (short ffmpeg calls under the active budget) so the `ffmpeg` lane stays free for proxies.
- Respect `paused`; each grade checks `signal.aborted`. Cache partial progress every 20 grades so a restart resumes.
- Auto-unload: `keep_alive: "5m"`. Add `pmset -g therm` polling (every 60 s) that pauses the queue if
  `CPU_Speed_Limit` < 100 appears and resumes after 2 clean readings; surface as `thermalPaused` in `/api/jobs`.

### 3.8 Definition of done
- Whole X5 card curated end-to-end with no failed jobs; per-clip time logged.
- "Auto-pick best 12" yields a mixed photo/video plan that previews and exports.
- `tsc` + `next build` pass; browser QA at 375/768/1280; report measured throughput and thermals.
- Write `docs/handoff/PHASE-3.md` covering Phase 3: **Story layer** — text-only pass producing title/subtitle,
  chapters (timestamp gaps + caption clusters), template recommendation from the 12 `TemplateStyle`s with reasons,
  pacing, music mood, and a mixed shot list; deterministic validators + heuristic fallback; wired into
  `expandTemplateForMedia`/`assignMediaToSlots`/`textOverlay`.

## 4. Later phases (for continuity)
- **Phase 4 — Settings + Gemini**: Settings page (performance profile, model selection/pull status, provider toggle,
  Gemini key stored in IndexedDB `settings` store and forwarded per request — never persisted server-side or logged);
  `GeminiProvider` (`gemini-3.5-flash-lite`, 512 px frames, `media_resolution: low`; optional whole-video agentic mode).
- **Phase 5 — 360 signature moves**: AI-directed yaw across the clip (virtual pan keyframes), tiny-planet slot effect
  (`v360=input=dfisheye:output=sg`), `.insp` reframing.

## 5. How to run
```
npm run dev              # http://127.0.0.1:5190 (localhost-only by design)
npx tsc --noEmit -p tsconfig.json
npx next build           # stop the dev server first
```
App data: `~/Library/Application Support/PhotoForge` (safe to delete to reset; the user's media is never touched).
Test folder used in Phase 1: `/tmp/pf-lib` (may be gone). Real library: `/Volumes/Insta360 X5/DCIM/Camera01`.
