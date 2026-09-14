# PhotoForge — Phase 5 handoff (360 signature moves)

You are continuing a five-phase build. Phases 1–4 are complete and verified on real footage. This document
is the single source of truth for what exists, what is proven, and exactly what Phase 5 must deliver. Phase 5
is the last planned phase; when it is done, write `docs/handoff/DONE.md` (same format: what shipped, verified
numbers, known gaps, and a "what next" list) so a future window can pick the product up cold.

## 0. Non-negotiables (apply to every phase)

- **Local-first and private.** Media never leaves this Mac unless the user has turned on the Gemini
  provider in Settings (Phase 4). Default provider is Ollama.
- **Never make the machine feel busy.** One job per heavy lane, `nice`d ffmpeg, hardware decode, bounded
  threads, model auto-unload, thermal watchdog. Measure before claiming.
- **Surgical changes.** Touch only what the phase needs. Match existing style. Don't refactor working code.
- **No new npm dependencies, env-file edits, port/URL changes, schema changes, or deletions without the
  user's explicit approval.** Node 20.19 → no in-repo TS test runner; verify pure modules by compiling to
  `/tmp` with a throwaway tsconfig and running Node asserts (see §5 for the recipe used in Phases 2–4).
- **Fail loud.** Report anything skipped or unverified. `npx tsc --noEmit -p tsconfig.json` and
  `npx next build` must pass. Stop the dev server before `next build`, then restart with `npm run dev`.
- **Best practices:** typed boundaries, small pure functions, atomic writes, spawn with arg arrays (never
  shell strings — `sendcmd` files are written to the job's tmp dir, never inlined), validate every request
  input, id-addressed media, localhost-only APIs (middleware matcher), structured logging with redaction.

## 1. Product context

PhotoForge (Next.js 14, `src/`) builds montage videos from photos/videos with 12 templates, an effects
engine, in-browser preview and ffmpeg.wasm export. Owner's goals 1–6 are all delivered (library curation,
deliberate photo/video mixing, flat 360, best moments, story layer, opt-in Gemini). Phase 5 makes the 360
footage *special* instead of merely flat.

Machine: Mac Studio M3 Ultra, macOS 26.6.2, ffmpeg 7.1.1 (VideoToolbox; `v360` reports `yaw`/`pitch`/`roll`
with the `T` flag = runtime commands), Ollama 0.33.3 + `qwen3.5:9b`. X5 card at
`/Volumes/Insta360 X5/DCIM/Camera01` (41 `.insv` + `.lrv`, all curated; 51 highlight clips rendered). Photo
test root `/tmp/pf-photos` (13 files). Both roots registered.

## 2. What exists (Phases 1–4)

Phases 1–3 are documented in `docs/handoff/PHASE-3.md` §2 and `docs/handoff/PHASE-4.md` §2. Phase 4 added:

### Server
- `src/server/ai/provider.ts` — `ProviderChoice` (`{kind:'local'} | {kind:'gemini', key, model?}`),
  `ProviderUnavailableError` (base class; `OllamaUnavailableError` extends it; `http.ts` maps it to **503**),
  shared `withInferenceLock()` (one model request in flight for *any* provider), optional `ping()` on
  `VisionProvider`.
- `src/server/ai/gemini.ts` — `GeminiProvider` via plain `fetch` to
  `https://generativelanguage.googleapis.com/v1beta/models/<id>:generateContent` with `x-goog-api-key`;
  parts = text + `inline_data` JPEG with per-part `media_resolution: MEDIA_RESOLUTION_LOW`;
  `generationConfig` = `responseMimeType: application/json` (JSON mode), `maxOutputTokens`,
  `thinkingConfig.thinkingLevel: MINIMAL`; **no temperature override** (Google advises defaults for 3.x);
  60 s timeout; ≥ 250 ms spacing between calls; one 2 s back-off on 429; 400 `API_KEY_INVALID` / 401 / 403 →
  "rejected the API key", 404 → model not found, 429/5xx → unavailable (item stays pending). Default model
  `gemini-3.5-flash-lite` (GA July 2026). `isPlausibleGeminiKey`, `isGeminiModelId`.
- `src/server/ai/session.ts` — the **only** place a cloud key exists server-side: process memory, one slot,
  60 min sliding TTL, `setCloudSession` / `getCloudSession` / `clearCloudSession` / `describeCloudSession`
  (never returns the key). A restart forgets it.
- `src/server/ai/index.ts` — `readProviderChoice(req)` parses/validates `X-PhotoForge-Provider`,
  `X-PhotoForge-Gemini-Key`, `X-PhotoForge-Gemini-Model` (parks a gemini key in the session);
  `createProvider(choice, localModel)`; `createProviderForKind(kind, localModel)` for background jobs
  (throws `ProviderUnavailableError` when the session expired → item pending, batch cancelled).
- Jobs: `EnqueueOptions.provider` / `JobInfo.provider` (`'local' | 'gemini'`, memory only);
  `planItemJobs(item, { provider })`; the `curate` handler health-checks Ollama only for local jobs, builds
  the provider per kind, and cancels only same-backend jobs on unavailability.
- `library/service.ts` — `analyseItems({ …, provider })`, `planStory({ …, provider })`, `testProvider(choice)`.
- Routes: `/api/curation/analyse` and `/api/story/plan` read the provider headers;
  `POST /api/system/provider-test` (one 5-token call; a failing key is un-parked); `GET|DELETE /api/system/session`;
  `/api/system/capabilities` gains `cloudSession: { active, kind?, model?, expiresAt? }`.
- `log.ts` exports `redact()`; verified it masks a Gemini-shaped key in header dumps and in long strings.

### Browser
- `src/lib/provider-settings.ts` — `AiProviderSettings { provider, geminiKey, geminiModel }` in IndexedDB
  (`settings` store, key `aiProvider`), in-memory mirror, `providerHeaders()` (empty for local),
  `cloudProviderActive()`. `library-client.ts` attaches the headers on `analyse`, `storyPlan`, `testProvider`;
  `clearCloudSession()`.
- `src/app/settings/page.tsx` — Performance profile (radio cards), Local model (select from pulled models,
  "not pulled" hint), AI provider (On this Mac | Google Gemini; masked key with Show, model id, Save provider,
  Test connection, Forget key; privacy note; "cloud key held in server memory" note). `Header.tsx` links to it.
- `LibraryPanel` status line shows "Cloud AI on — 512-px frames and captions leave this Mac" when Gemini is
  chosen and lets Analyse run without Ollama; `page.tsx` loads provider settings before writing a story.

### Verified numbers (Phase 4)
- Against Google's live API with a **fake key**: `provider-test` → 503 "Gemini rejected the API key";
  missing key → 400; local → `{ ok, ollama, qwen3.5:9b }`. A gemini-backed `curate` job ran, was rejected,
  and the item **stayed pending** (not failed), job error surfaced; re-analysed locally → ready.
- Google validates the request **schema before the key**: a body with a bogus `generationConfig` field is
  rejected with "Unknown name", while this provider's exact body (inline_data + per-part media_resolution +
  responseMimeType + thinkingConfig.thinkingLevel) passes schema validation and fails only on the key — the
  strongest contract check possible without a real key.
- Key hygiene: 0 occurrences of the fake key in the dev log; `state/settings.json` holds only
  `performanceProfile` and `visionModel`; session cleared by Forget key and by restart.
- Settings page QA at 375 / 768 / 1280, dark mode; choice + key persist across reload (IndexedDB).
- Pure checks: 18 curation/redaction/gemini + 10 story, all passing. `tsc` + `next build` pass. Thermals clean.

### NOT verified (needs a real key — say so in your report if you also cannot)
- End-to-end grading and story writing through Gemini with a valid key (rate limits, latency, output quality).
- The optional whole-video agentic mode was **not built** (stub-free by design; see PHASE-4 §3.3).

### Known gaps
- Export can hang in a long-lived browser tab (1 of 3 runs in Phase 3; no timeouts in `seekToTime` /
  `writeFrame`). If it recurs, add a bounded wait that surfaces an error.
- Template step edits the base template while render uses the expanded one; split-screen slots only draw
  text with a base overlay (both pre-existing).
- Photos library needs Full Disk Access for the launching app; happy path unverified.
- `highlightCap = round(duration/150)` → one moment for clips under 225 s.
- Cache GC for orphaned artefacts not implemented.

## 3. Phase 5 scope — 360 signature moves

Goal: three moves that only a 360 camera can give, produced deterministically from curation data, with the
model used only where it adds judgement (which way to look), plus the ability to fix the look by hand.

### 3.1 Facts measured on this machine (build on these)
- `v360` yaw/pitch/roll accept runtime commands (`T` flag). Drive them with `sendcmd=f=<file>` placed
  **before** `crop`/`v360` in the chain. **Commands are relative**: each `v360 yaw <deg>` adds to the current
  rotation. Send *deltas* between keyframes (or `reset_rot 1` then an absolute value). Absolute values
  accumulate and swing past the lens edge — measured.
- Proof: a 4 s eased pan −40° → +40° at 100° hFov from the `.lrv` (`-ss 58 -t 4`, 41 delta commands at
  0.1 s), 1280×720 h264_videotoolbox: **1.5 s wall**, no lens edges, smooth.
- Tiny planet from the `.lrv` in one filter: `v360=input=dfisheye:ih_fov=200:iv_fov=200:output=sg:h_fov=250:v_fov=250:w=640:h=640:pitch=-90`
  — 0.1 s for a frame; looks right (people on the "planet", cathedral below). The `.lrv` is lens A = right
  half; `dfisheye` input expects both circles, which the `.lrv` provides directly.
- Keep hFov 100 views within ±45° yaw of a lens centre (Phase 2 finding) unless you also change lens.

### 3.2 AI-directed yaw across a clip (`src/server/media/pan.ts` + job `pan360`)
- Input: a 360 highlight window plus the graded yaw candidates Phase 2 already produced at `sampleT`
  (`HighlightWindow.view`). Extend `pickView` to also grade candidates at `start` and `end` of the window
  (6 each, same lens set) and store `HighlightWindow.viewPath: [{ t, lens, yawDeg, pitchDeg }]` (2–3 keyframes).
  Constraint: keep one lens per clip (changing lens mid-window needs a cut); if the best end view is on the
  other lens, pick the best same-lens candidate instead.
- Render: `renderPanProxy(item, window, viewPath)` → `cache/proxies/<id>-hl-<n>-pan.mp4` from the INSV
  (1920×1080, 12 Mbps): write a `sendcmd` file into the job tmp dir with eased (ease-in-out) yaw/pitch deltas
  every 0.1 s between keyframes, then `-ss start-0.5 -t len+1 -i insv -map 0:v:<lens> -vf sendcmd=f=…,v360=…:yaw=<k0>`.
  Cap total sweep at 90° over the window; if the model's keyframes disagree wildly (> 120°), fall back to a
  static view.
- Wire: `MontagePick.highlightPanReady`; `montagePickToMediaFile` prefers the pan clip when present. Job runs
  on the `ffmpeg` lane after `highlights` (priority 45), enqueued only for windows whose keyframes differ by ≥ 10°.

### 3.3 Tiny-planet slot effect
- New `TemplateSlot.reframe?: 'flat' | 'tiny-planet'` (default flat). Server: `renderTinyPlanetProxy()` →
  `cache/proxies/<id>-hl-<n>-planet.mp4` (square 1080×1080, from the `.lrv` is fine — it is a stylised shot),
  `GET /api/media/[id]/highlight/[n]/planet/stream`. Browser: the effects engine already fits any aspect;
  use `holdPoint: 'center'` and a slow `orbit`/`slow-zoom`. Story layer: the heuristic and the model prompt
  may mark **one** shot per montage as `role: 'planet'` (add to `ShotRole`) — best used as opener or closer.
- Templates: give Cinematic Journey's last slot and Summer Vibes' first slot `reframe: 'tiny-planet'` when
  the assigned media is 360 (assignment decides; flat media renders normally).

### 3.4 `.insp` reframing (360 photos)
- Scanner already treats `.insp` as JPEG. Add `layout: 'dual-fisheye-sbs'` for `.insp` (verify with one real
  file — the X5 writes dual-fisheye side by side in a JPEG container; if none on the card, note it as
  unverified and gate the code path on a probe of width ≈ 2 × height).
- Thumbnail = equirect 512×256 (as Phase 2's grading frames); rendition = flat 2048×1152 at the model-picked
  yaw (reuse `pickView` on the photo); optional tiny-planet rendition.

### 3.5 Per-highlight yaw editing (UI)
- In `MediaStep`, a 360 highlight entry gets a "Reframe" affordance: a small viewer that shows the current
  flat frame and lets the user drag yaw (±45°) / pitch (±30°) with keyboard support (arrow keys, 5° steps).
  Preview by requesting `GET /api/media/[id]/highlight/[n]/frame?yaw=&pitch=&lens=` (one ffmpeg frame from
  the `.lrv`, cached by rounded angles). "Apply" → `PUT /api/library/items/[id]/highlights/[n]/view` →
  re-render the highlight clip (and pan clip) with the new view; mark the window `view.source: 'user'` so
  re-curation never overrides a manual choice.

### 3.6 Safety
- All new ffmpeg work runs on the `ffmpeg` lane under the active budget; `sendcmd` files live in the job tmp
  dir and are removed with it. Frame previews for the editor share the rendition concurrency cap.
- Nothing in this phase talks to a model except the extra yaw grades (which honour the provider choice).

### 3.7 Definition of done
- Whole card: pan clips for every window whose keyframes moved; at least three visibly different pans
  verified from frames pulled out of the rendered MP4s; tiny planet on one opener and one closer; a
  montage with both previews and exports.
- Manual yaw edit round-trips (edit → re-render → preview shows the new view) and survives re-analysis.
- `tsc` + `next build` pass; browser QA at 375/768/1280; 0 failed jobs; `pmset -g therm` clean.
- Write `docs/handoff/DONE.md`.

## 4. How to run
```
npm run dev              # http://127.0.0.1:5190 (localhost-only by design)
npx tsc --noEmit -p tsconfig.json
npx next build           # stop the dev server first, then npm run dev again
```
Settings page: http://127.0.0.1:5190/settings. App data: `~/Library/Application Support/PhotoForge`.

## 5. Pure-module check recipe (used in Phases 2–4)
`/tmp/pf2/tsconfig.test.json` extends the repo tsconfig with `noEmit:false`, `outDir:/tmp/pf2/build`,
`rootDir:<repo>/src`, `module:commonjs`, `target:es2020`, `incremental:false`, and includes
`src/server/**`, `src/types/**`, `src/lib/templates.ts`, `src/lib/story-apply.ts`. Test files
(`/tmp/pf2/unit.js`, `/tmp/pf2/unit-story.js`) install a `Module._resolveFilename` shim mapping `@/…` to
the build dir and use Node's `assert`. Recreate as needed; never commit them.
