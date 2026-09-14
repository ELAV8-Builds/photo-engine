# PhotoForge — Phase 3 handoff (Story layer)

You are continuing a five-phase build. Phases 1 and 2 are complete and verified on real footage. This
document is the single source of truth for what exists, what is proven, and exactly what Phase 3 must
deliver. When Phase 3 is done, write `docs/handoff/PHASE-4.md` in the same format so the next window can continue.

## 0. Non-negotiables (apply to every phase)

- **Local-first and private.** Media never leaves this Mac unless the user explicitly enables the
  Gemini provider (Phase 4). Default provider is Ollama.
- **Never make the machine feel busy.** One job per heavy lane, `nice`d ffmpeg, hardware decode,
  bounded threads, model auto-unload (`keep_alive: 5m`), thermal watchdog. Measure before claiming.
- **Surgical changes.** Touch only what the phase needs. Match existing style. Don't refactor working code.
- **No new npm dependencies, env-file edits, port/URL changes, schema changes, or deletions
  without the user's explicit approval.** Node 20.19 (no `--experimental-strip-types`), so there is no
  in-repo TypeScript test runner; verify pure modules by compiling to `/tmp` with a throwaway tsconfig
  (`tsc -p /tmp/…/tsconfig.test.json`, `extends` the repo one, `noEmit:false`, `outDir:/tmp/…`) and
  running plain Node asserts — that is how Phase 2 was checked. If you want vitest, ask first.
- **Fail loud.** Report anything skipped or unverified. `npx tsc --noEmit -p tsconfig.json` and
  `npx next build` must pass before you call a phase done. Stop the dev server before `next build`
  (they share `.next/`), then restart it with `npm run dev`.
- **Best practices:** typed boundaries, small pure functions, atomic writes, spawn with arg arrays
  (never shell strings), validate every request input, id-addressed media (browser never sees paths),
  localhost-only APIs (middleware matcher must include every new `/api/*` prefix), structured logging
  with redaction. No spaghetti — if a module would grow past one responsibility, split it.

## 1. Product context

PhotoForge (Next.js 14, `src/`) builds montage videos from photos/videos with 12 templates
(`src/lib/templates.ts`, `TemplateStyle` = cinematic | dynamic | minimal | retro | glitch | parallax |
summer | winter | party | electric | golden | neon), an effects engine, in-browser preview and ffmpeg.wasm
export. Owner's goals:
1. Point at whole library folders; the app decides which photos/video moments are best. **(Phase 2 ✅)**
2. Mix videos and photos deliberately — every slot is still `slotType: 'any'` and `assignMediaToSlots`
   is round-robin; the type field is unused in assignment. **(Phase 3)**
3. Insta360 X5 360° footage becomes flat, watchable video. **(Phase 1 ✅, per-highlight yaw in Phase 2 ✅)**
4. Find the best 3–5 s moments inside long videos without watching every frame. **(Phase 2 ✅)**
5. Content-aware titles, chapters, template recommendation from a local model. **(Phase 3)**
6. Gemini as an opt-in provider with a key entered in Settings. **(Phase 4)**

Machine: Mac Studio M3 Ultra, 256 GB, macOS 26.6.2, ffmpeg 7.1.1 (VideoToolbox), Ollama 0.33.3 at
`http://localhost:11434`, model `qwen3.5:9b` (6.6 GB, vision + thinking; we always send `think:false`).
exiftool, sips present. The X5 SD card is mounted at `/Volumes/Insta360 X5/DCIM/Camera01` (41 `.insv` +
paired `.lrv`, 92.5 min, all 360 video — no photos). A 13-photo test root lives at `/tmp/pf-photos`
(JPEG + HEIC + one portrait, EXIF dates spread over the trip; regenerate if `/tmp` was cleared — see §6).

## 2. What exists (Phases 1 + 2)

### Server (`src/server/**`, Node runtime only — `assertServer()` guards every module)
Phase 1 (unchanged unless noted): `runtime.ts` (app data dir `~/Library/Application Support/PhotoForge`,
`writeJsonAtomic`, `globalSingleton`), `log.ts`, `maintenance.ts`, `fs/safe-path.ts`, `settings/store.ts`
(now also `visionModel`, validated by `isModelTag`), `media/{binaries,ffmpeg,probe,reframe,thumbnails}.ts`,
`analysis/{signals,technical-score}.ts` (`parseMetadataPrint`, `escapeFilterPath`, `bucketBySecond`,
`motionScore` are exported for reuse), `library/{registry,index-store,scanner,work,service}.ts`,
`jobs/{queue,handlers}.ts`, `http.ts` (`serveFile` now streams via a pull-based adapter — Node 20's
`Readable.toWeb` threw uncaught `ERR_INVALID_STATE` on every abandoned `<video>` Range request).

Phase 2 additions:
- `ai/provider.ts` — `VisionProvider { name, model, gradeFrame(jpeg, ctx), describeImage(jpeg, ctx), writeJson(prompt, ctx) }`,
  `FRAME_GRADE_PROMPT` (anchored 0–10 scale; without anchors the model returns 5 for everything),
  `parseFrameGrade()` (clamps/normalises untrusted model JSON), `InvalidModelOutputError`.
- `ai/ollama.ts` — `ollamaHealth()` (`/api/version` + `/api/tags`, never throws), `hasModel()`,
  `OllamaProvider` (`/api/chat`, `format:"json"`, `think:false`, `keep_alive:"5m"`, temp 0.1, 120 s
  timeout via `AbortSignal.any`, retry once with a stricter suffix on invalid JSON), a **process-wide
  inference lock** (one request in flight, even from API routes), `OllamaUnavailableError` → HTTP 503.
  `writeJson(prompt)` is text-only with `num_predict: 1200` — **this is the entry point Phase 3 uses.**
- `analysis/phash.ts` — pure 64-bit average hash over ffmpeg's `scale=16:16,format=gray` raw stream; Hamming distance.
- `analysis/frames.ts` — `extractSampleFrames()` (one ffmpeg pass: 0.5 fps → 512 px JPEGs named by frame
  index via `-frame_pts 1` + raw hash stream; 360 sources are unwrapped from the `.lrv` to a 512×256
  **equirect** so one frame shows the whole sphere), `renderViewCandidates()` (all yaw candidates of one
  moment in one ffmpeg call), `measureWindow()` (2 fps scene/edge over ±3 s), `YAW_CANDIDATES_DEG = [-45, 0, 45]`
  per lens (±60 shows the fisheye edge as a black crescent — measured), `PITCH_DOWN_DEG = -35`.
- `analysis/highlights.ts` — pure `planSampleTimes` (4 s base, 2 s near audio/novelty events, 6 s in static
  stretches, thinned to `maxSamples 240`), `fuseCandidate` (spec formula; `blocked` drops, `dark|blur|bright`
  only drop when Stage-1 `technical < 0.5`, otherwise ×0.7 — the model over-flags sunlit/dim frames),
  `selectPeaks` (NMS, gap = max(20 s, 5 %), cap = clamp(round(dur/150), 1, 8)), `refineWindow`
  (4 s snapped to peak sharpness × motion), `photoScore`; orchestration `curateVideo` / `curatePhoto`
  with partial-progress files every 20 grades and a `pickView` step (6 yaw candidates, +2 pitched-down when
  the sphere saw faces but no flat view did; choose max interest + 0.1 if faces).
- `curation/record.ts` — `cache/analysis/<id>.curation.json` (`CurationRecord`), `.curation.partial.json`,
  `highlightProxyPath(id, n)` = `cache/proxies/<id>-hl-<n>.mp4`, `summarize()` → `CurationSummary` on the item.
- `curation/select.ts` — pure `selectForMontage(items, records, { slots, videoRatio=0.4, chronological=true, exclude })`
  → `MontagePick[]` with kind ratio, per-clip discount (×0.75 per extra pick), caption-word diversity
  (×(1−0.4·overlap)), readiness (`highlightReady`), chronological order and same-clip run breaking.
- `jobs/queue.ts` — `PRIORITY.highlights 40`, `PRIORITY.curate 50`; `setThermalPause()`; snapshot has `thermalPaused`.
- `jobs/thermal.ts` — polls `/usr/bin/pmset -g therm` every 60 s; `CPU_Speed_Limit < 100` pauses, 2 clean readings resume.
- `jobs/handlers.ts` — `curate` (model lane; health-gated: if Ollama/model is missing it cancels the rest of
  the lane and leaves items **pending**, never failed), `highlights` (ffmpeg lane; renders each 360 window
  from the **INSV** at 1920×1080 / 12 Mbps with the chosen `view`, ±0.5 s margin). `signals` now re-plans work when done.
- `library/work.ts` — plans `curate` when thumb (photo) / signals (video) are ready; `highlights` when curate is ready.
- `library/index-store.ts` — indexes written before Phase 2 are migrated on load (`curate: 'pending'`, `highlights` per kind).
- `library/service.ts` — bootstrap starts the thermal watchdog and **defers** curate jobs when the model is
  unavailable; `analyseItems({ itemIds?, force? })`, `getCurationRecord`, `planMontage`; `registerRoot(path, label?)`.
- `photos/library.ts` — `detectPhotosLibrary()` finds `~/Pictures/*.photoslibrary`, reports whether
  `<bundle>/originals` is readable (macOS TCC), `PHOTOS_PERMISSION_HELP`.
- `media/thumbnails.ts` — `ensureHighlightThumb()` (middle frame of a rendered highlight clip, on demand, shares the rendition slot cap).

### API (all under the localhost-only middleware; new prefix `/api/curation`)
Phase 1 routes unchanged, plus:
- `POST /api/curation/analyse` `{ itemIds?: string[], force?: boolean }` → `{ enqueued, skipped }` (503 when Ollama/model is unavailable).
- `POST /api/curation/select` `{ slots 1–200, videoRatio?, chronological?, exclude?: ("<id>"|"<id>#<n>")[] }` → `{ picks: MontagePick[], considered }`.
- `GET /api/library/items/[id]/curation` → `{ record: CurationRecord }`.
- `GET|HEAD /api/media/[id]/highlight/[n]/stream` (Range), `GET /api/media/[id]/highlight/[n]/thumb`.
- `GET /api/system/capabilities` now includes `ollama: { running, version, models, model, modelAvailable }` and
  `photosLibrary: { found, label, readable, registeredRootId }`.
- `POST /api/system/photos-library` registers the Photos originals folder (404 none, 403 + guidance when blocked).
- `PUT /api/settings` accepts `visionModel`.

### Shared types (`src/types/library.ts`)
`ItemStatus.curate`, `ItemStatus.highlights`, `LibraryItem.curation?: CurationSummary`, `JobType` +
`'curate' | 'highlights'`, `QueueSnapshot.thermalPaused`, `ServerSettings.visionModel`, `FrameGrade`,
`FrameQuality`, `HighlightView`, `HighlightWindow`, `CurationRecord`, `MontagePick`, `PhotosLibraryInfo`.

### Browser
- `src/lib/library-client.ts` — `libraryApi.{analyse, curation, select, addPhotosLibrary}`, `mediaUrl.{highlight, highlightThumb}`,
  `libraryMediaId(itemId, hl?)` = `lib-<id>` / `lib-<id>-hl<n>`, `pickKey`, `montagePickToMediaFile()` (360 picks
  play the highlight clip with `trimStart 0.5 / trimEnd 0.5+len`; flat videos use the original with the window
  as trim; `thumbnailUrl` is the highlight thumb so face detection sees the chosen view), `describeJob` for the new jobs.
- `src/components/LibraryPanel.tsx` — local-AI status line, "Add Photos Library", sort (time | score), score chip
  `▶ n` moments, "Analysing…", "Analyse library", "Re-analyse N selected", "Auto-pick best N → Add to project"
  (N follows the chosen template's `mediaCount`, default 12), "MOMENT IN PROJECT" vs "IN PROJECT",
  thermal-pause label. Props: `inProjectIds`, `inProjectMediaIds`, `suggestedPickCount`, `onAddMedia`.
- `src/components/MediaStep.tsx` — dedups by `MediaFile.id` (so several highlights of one clip coexist); `suggestedPickCount` prop.
- `src/app/page.tsx` — computes `suggestedPickCount` from `SMART_TEMPLATES`.

### Verified numbers (real X5 card + photo root, balanced profile, hardware decode)
- Whole card curated end to end: **41/41 videos and 13/13 photos have records; 51 highlight windows; 51/51 flat
  1080p highlight clips rendered (236 MB)**. Pure curation compute 1,464 s for 5,550 s of footage (≈ 3.8× realtime);
  wall span 29 min including one deliberate server kill/restart and browser QA. 1,073 model grades in total,
  1,113 sampled seconds, 325 grades reused via perceptual hash. `pmset -g therm` recorded no CPU speed limit at any
  point; the model unloaded itself 5 min after the last grade (`/api/ps` empty). One job failed during the run
  (clip 040, a 0.5 s LRV: mjpeg refused the negotiated pixel format) — fixed by pinning `format=yuvj420p` on every
  JPEG output and re-run successfully (record with 0 highlights, no failure).
- Per clip: 67 s → 27 s (15 samples, 18 grades incl. 6 yaw, 1 highlight); 140 s → 51 s; 250 s → 54 s after a
  resume (20 grades reused from the partial file); 373 s → 99 s (2 highlights); 30 min clip → 203 s with 70 grades
  (157 samples, 135 reused — the camera sat in a dim room, so dedup did its job) and 8 highlights spread 12 s → 1746 s.
  Grade latency ≈ 0.95–1.1 s per 512 px frame; first call after idle ≈ 4.6 s (model load). Photos ≈ 1.04 s each.
- Frame extraction: 0.5 fps equirect + hash stream from the LRV, hardware decode ≈ 16× realtime at ~1.3 CPU-s per
  clip (software decode is 4× faster in wall time but burns ~6 cores — rejected on principle).
- Yaw pick: 6 candidates rendered in one 0.28 s ffmpeg call; on the glass-tower clip the model chose the city
  view over the default lens-A ceiling; on clip 001 it turned lens B to a face (verified visually from the 1080p clip).
- Dedup: Hamming ≤ 6 reused 0–19 grades per clip (handheld footage is mostly novel; static stretches benefit).
- Stage-1 gate still decides: the blown-out clip 002 (luma 253) produced 0 samples and 0 highlights in 2 s.
- Auto-pick best 12 (videos only on the card) → 12 trimmed highlight entries, 49 faces detected on highlight
  thumbnails, "Choose Template" enabled. With the photo root added, Auto-pick best 12 → **7 photos + 5 video
  moments**, interleaved chronologically across both roots; Cinematic Journey previewed (highlight clip plays with
  the template text) and **exported to MP4 at 720p: 1280×720, 56.4 s, 14.6 MB, decodes in the browser**; the
  project auto-saved.
- Crash recovery: server killed at 44 % of clip 027 → on restart 1 stale temp dir swept, 28 jobs resumed, the 20
  saved grades reused, no orphan ffmpeg.
- Streaming fix: 6 concurrent aborted 300 MB Range requests → 0 uncaught exceptions, 0 leaked file handles.
- Pure-function checks (16, in `/tmp`): grade parsing, phash, sampling plan, fusion, NMS, refine, photo score,
  selection ratio/diversity/readiness, thermal parsing, model-tag matching.
- Browser QA at 375 / 768 / 1280: layout clean after fixing a badge collision and a wrapping button at 375;
  accessible names carry score, moment count and caption; the Photos-library button shows the macOS permission guidance.

### Known gaps / notes for later phases
- **Photos library needs Full Disk Access** for the app that launches PhotoForge (Terminal/editor). The
  blocked path is verified; the happy path (indexing `originals/`) could not be exercised here because this
  session's process lacks the permission. The alternative "pick files directly" is already available through the
  drop zone's file dialog (macOS shows Photos in its sidebar); a native multi-file picker would need a non-folder
  root model — not built.
- `assignMediaToSlots` still ignores `slotType`; Phase 3 wires it.
- Highlight windows for **flat** (non-360) videos have no rendered clip/thumbnail; they use the original + trim
  and the generic 1 s thumbnail. None on the current card.
- Every clip under 225 s yields exactly one highlight (cap = round(dur/150)); consider `ceil` if the owner wants
  more moments from 1–3 min clips.
- Header overlaps the step nav at ~768 px — pre-existing.
- Cache GC (orphaned thumbs/proxies/highlight clips when files change or roots are removed) not implemented.
- `tsconfig.tsbuildinfo` is tracked and churns on every `tsc` run.

## 3. Phase 3 scope — Story layer

Goal: turn a curated selection into a **story**: title/subtitle, chapters, a recommended template with reasons,
pacing, music mood, and a deliberate photo/video shot list — produced by a text-only local model pass over the
curation captions, validated deterministically, with a heuristic fallback so the app never depends on the model
being up. Wire it into template expansion, slot assignment and text overlays.

### 3.1 Story input (`src/server/story/context.ts`, pure)
Build a compact `StoryContext` from the current picks (or the whole curated library when no picks exist):
`{ dateRange, dayCount, items: [{ id, kind, at, caption, scene, people, faces, score, durationSec? }] }`,
sorted by time, ≤ 120 entries (down-sample evenly beyond that), captions de-duplicated. No paths, no filenames.

### 3.2 Model pass (`src/server/story/generate.ts`)
Use `VisionProvider.writeJson(prompt)` (Ollama today; Gemini in Phase 4). One prompt, one JSON reply:
```
{ "title": "≤ 6 words", "subtitle": "≤ 12 words",
  "chapters": [{ "title": "≤ 4 words", "startIndex": n, "endIndex": n }],
  "template": one of the 12 TemplateStyle ids, "templateReasons": ["≤ 12 words", …up to 3],
  "pacing": "calm" | "steady" | "fast", "musicMood": "≤ 4 words",
  "shotList": [{ "index": n, "role": "opener" | "beat" | "breather" | "closer" }] }
```
Prompt rules: describe the 12 templates in one line each (name, mood, ideal content), pass the context as a
numbered list, ask for JSON only. `num_predict` 1200 is already set. One retry with a stricter reminder on
invalid JSON (same pattern as `gradeFrame`). Every field is validated in `src/server/story/validate.ts` (pure):
unknown template → fallback; chapter ranges clamped, non-overlapping, ≥ 2 items, ≤ 8 chapters, ordered; word
limits enforced; shot list indices deduped and in range; roles default to `beat`.

### 3.3 Heuristic fallback (`src/server/story/heuristic.ts`, pure)
When Ollama is down or output is invalid: chapters from capture-time gaps (> 45 min or a new day) merged to ≤ 8;
title from the most frequent scene words + date ("Prague, July 2026"); template from a fixed mapping
(people-heavy + fast motion → dynamic/party; scenery → cinematic/golden; indoor low-light → neon/electric;
default cinematic); pacing from median motion score; shot list = opener (best faces pick), closer (last chronological), rest beats.

### 3.4 Persistence + API
`cache/analysis/story-<hash of item ids>.json` (`StoryPlan`, versioned, includes `source: 'model' | 'heuristic'`).
`POST /api/story/plan` `{ itemIds?: string[], picks?: MontagePick[], force?: boolean }` → `{ plan }`. Runs on the
`model` lane through a short-lived job or the inference lock (the request may take 10–30 s; return 202 + poll if
you choose a job). Add `/api/story` to the middleware matcher.

### 3.5 Wiring into the editor
- `SmartTemplate.slots[].slotType` becomes meaningful: `assignMediaToSlots(template, mediaIds, mediaKinds?)`
  prefers matching kinds, keeps round-robin as the fallback. `expandTemplateForMedia` gets an optional
  `shotList` so openers/closers land on hero slots and breathers get longer durations. Keep both functions
  backward compatible — they are called from `page.tsx`, `RenderStep.tsx`, `MusicStep.tsx`.
- Text overlays: title → first slot's `textOverlay.text`, subtitle → second, chapter titles → the first slot of each
  chapter, closer keeps the template's closing text. Apply through the existing `textOverrides` map
  (`Record<slotIndex, TextOverlayOverride>`), never by mutating `SMART_TEMPLATES`.
- UI: a "Story" card in `TemplateStep` showing title/subtitle/chapters/recommended template with reasons and an
  "Apply" button (selects the template + fills overrides) and "Regenerate". Everything stays editable.
- Music mood + pacing are informational in Phase 3 (shown in `MusicStep`); no audio search.

### 3.6 Safety
Text-only prompts contain captions and dates only — never paths, filenames or EXIF GPS. Log the prompt length,
not the prompt. Respect `paused`/thermal pause if you run it as a job.

### 3.7 Definition of done
- Story plan generated for the X5 card picks with the model and, with Ollama stopped, from the heuristic; both
  validate and apply.
- Template recommendation + reasons visible and applicable; slot assignment honours `slotType` on at least one
  template updated to mix `photo` / `video` slots deliberately.
- Chapter titles render in preview and export.
- `tsc` + `next build` pass; browser QA at 375/768/1280; whole-card run still 0 failed jobs; `pmset -g therm` clean.
- Write `docs/handoff/PHASE-4.md` covering **Settings + Gemini**: Settings page (performance profile, `visionModel`
  selection with pull status via `/api/tags`, provider toggle), Gemini key stored in IndexedDB and forwarded per
  request — never persisted server-side or logged (the logger already redacts `*key*`/`token` fields);
  `GeminiProvider` implementing `VisionProvider` (`gemini-3.5-flash-lite`, 512 px frames, `media_resolution: low`);
  optional whole-video agentic mode behind a flag. Do real-time research on the current Gemini API before coding.

## 4. Later phases (for continuity)
- **Phase 4 — Settings + Gemini** (above).
- **Phase 5 — 360 signature moves**: AI-directed yaw across a clip (virtual pan keyframes between graded views),
  tiny-planet slot effect (`v360=input=dfisheye:output=sg`), `.insp` reframing, per-highlight yaw editing in the UI.

## 5. How to run
```
npm run dev              # http://127.0.0.1:5190 (localhost-only by design)
npx tsc --noEmit -p tsconfig.json
npx next build           # stop the dev server first, then npm run dev again
curl -s http://127.0.0.1:5190/api/jobs | jq .   # queue + thermalPaused
curl -s http://127.0.0.1:5190/api/system/capabilities | jq .ollama
```
App data: `~/Library/Application Support/PhotoForge` (safe to delete to reset; the user's media is never touched).
Curation records: `cache/analysis/<id>.curation.json`; highlight clips: `cache/proxies/<id>-hl-<n>.mp4`.
Ollama must be running for curation; when it is not, items stay pending and "Analyse library" retries.

## 6. Test photo root
`/tmp/pf-photos` was produced from LRV frames (flat views at 1920×1080) with EXIF `DateTimeOriginal` set via
exiftool, plus one `transpose=1` portrait and two HEICs made with `sips -s format heic`. Regenerate with any
similar ffmpeg/exiftool loop if `/tmp` is gone, then `POST /api/library/roots {"path":"/tmp/pf-photos"}`.
