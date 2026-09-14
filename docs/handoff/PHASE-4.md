# PhotoForge — Phase 4 handoff (Settings + Gemini provider)

You are continuing a five-phase build. Phases 1–3 are complete and verified on real footage. This document
is the single source of truth for what exists, what is proven, and exactly what Phase 4 must deliver. When
Phase 4 is done, write `docs/handoff/PHASE-5.md` in the same format so the next window can continue.

## 0. Non-negotiables (apply to every phase)

- **Local-first and private.** Media never leaves this Mac unless the user explicitly enables the Gemini
  provider — which is what this phase adds. Default provider stays Ollama. The Gemini key is entered in the
  browser, kept in IndexedDB, forwarded per request, and is **never persisted server-side or logged**.
- **Never make the machine feel busy.** One job per heavy lane, `nice`d ffmpeg, hardware decode, bounded
  threads, model auto-unload (`keep_alive: 5m`), thermal watchdog. Measure before claiming.
- **Surgical changes.** Touch only what the phase needs. Match existing style. Don't refactor working code.
- **No new npm dependencies, env-file edits, port/URL changes, schema changes, or deletions without the
  user's explicit approval.** Gemini must be called with plain `fetch` (no SDK). Node 20.19 → no in-repo TS
  test runner; verify pure modules by compiling to `/tmp` with a throwaway tsconfig (`extends` the repo one,
  `noEmit:false`, `outDir:/tmp/…`, `module: commonjs`) and running Node asserts — Phases 2–3 did exactly this.
- **Fail loud.** Report anything skipped or unverified. `npx tsc --noEmit -p tsconfig.json` and
  `npx next build` must pass. Stop the dev server before `next build`, then restart with `npm run dev`.
- **Best practices:** typed boundaries, small pure functions, atomic writes, spawn with arg arrays, validate
  every request input, id-addressed media, localhost-only APIs (add every new `/api/*` prefix to the
  middleware matcher), structured logging with redaction (`log.ts` already redacts keys matching
  `api[_-]?key|token|secret|authorization|password` and long opaque strings). No spaghetti.
- **Do real-time research on the current Gemini API before writing the provider** (model names, request
  shape, `media_resolution`, safety settings, rate limits change often; do not trust training data).

## 1. Product context

PhotoForge (Next.js 14, `src/`) builds montage videos from photos/videos with 12 templates
(`src/lib/templates.ts`), an effects engine, in-browser preview and ffmpeg.wasm export. Owner's goals:
1. Point at whole library folders; the app decides which photos/video moments are best. **(Phase 2 ✅)**
2. Mix videos and photos deliberately. **(Phase 3 ✅ — kind-aware slot assignment; Cinematic Journey and Rapid Fire have typed slots)**
3. Insta360 X5 360° footage becomes flat, watchable video. **(Phase 1 ✅, per-highlight yaw Phase 2 ✅)**
4. Best 3–5 s moments inside long videos. **(Phase 2 ✅)**
5. Content-aware titles, chapters, template recommendation from a local model. **(Phase 3 ✅)**
6. Gemini as an opt-in provider with a key entered in Settings. **(Phase 4 — this one)**

Machine: Mac Studio M3 Ultra, 256 GB, macOS 26.6.2, ffmpeg 7.1.1 (VideoToolbox), Ollama 0.33.3 at
`http://localhost:11434`, model `qwen3.5:9b`. X5 card at `/Volumes/Insta360 X5/DCIM/Camera01` (41 `.insv` +
`.lrv`, 92.5 min, all 360 video). Photo test root `/tmp/pf-photos` (13 files; see PHASE-3.md §6 to regenerate).
Both roots are registered and fully curated in the app data dir.

## 2. What exists (Phases 1–3)

### Server (`src/server/**`, Node runtime only — `assertServer()` in every module)
Phase 1/2 modules are described in `docs/handoff/PHASE-3.md` §2 and are unchanged in Phase 3 except:
- `library/service.ts` — `curatedSources()` (every curated item + record), `planMontage`, and new
  `planStory({ keys?, force? })` → `{ plan, cached }`: builds the story context, returns the cached plan for
  that exact shot list unless forced, uses the model when `visionModelReady()`, else the heuristic; persists.

Phase 3 additions (`src/server/story/`):
- `context.ts` — pure. `parseKey`, `buildStoryContext(keys, sources)` → `StoryContext` (≤ 120 entries,
  evenly down-sampled, captions/scene/kind/time/score only — no paths or filenames), `defaultKeys(sources)`
  (all photos + every video highlight by time).
- `validate.ts` — pure. `STORY_TEMPLATE_STYLES`, `STORY_LIMITS`, `words()`, `coerceTemplateStyle` (accepts
  "Cinematic Journey" → `cinematic`), `normaliseChapters` (ordered, non-overlapping, gap-filled, ≥ 2 shots,
  ≤ 8), `normaliseShotList` (exactly one opener + one closer), `validateStoryPlan` → throws
  `InvalidStoryError` when title/template are missing.
- `heuristic.ts` — pure. Chapters from day changes / > 45 min gaps merged to ≤ 8; title from top caption
  words + month/year (quality adjectives are stop-listed); template from caption keywords + face/video
  shares; pacing; shot list (opener = best face shot in the first half, closer = last, breathers = calm photos).
- `generate.ts` — `TEMPLATE_CATALOG` (one line per style), `buildStoryPrompt(ctx)`, `generateStoryPlan(ctx,
  { provider })` (one retry with a stricter suffix, heuristic fallback on `OllamaUnavailableError` / invalid
  output), `story-<sha1(keys)>.json` cache under `cache/analysis/`.
- API: `POST /api/story/plan` `{ keys?: ("<id>"|"<id>#<n>")[], force?: boolean }` → `{ plan, cached }`
  (always 200; `plan.source` is `model` or `heuristic`). Middleware matcher includes `/api/story`.

### Shared types (`src/types/library.ts`)
Phase 3: `StoryTemplateStyle` (= `TemplateStyle` from `src/types/index.ts`), `StoryPacing`, `ShotRole`,
`StoryContextEntry`, `StoryContext`, `StoryChapter`, `StoryShot`, `StoryPlan` (`version 1`, `source`,
`model?`, `keys`, `title`, `subtitle`, `chapters`, `templateStyle`, `templateReasons`, `pacing`, `musicMood`,
`shotList`). Phase 2 types unchanged.

### Browser
- `src/lib/templates.ts` — `assignMediaToSlots(template, mediaIds, kinds?)`: with `kinds`, `photo`/`video`
  slots take the next unused media of that kind (fallback to any), `any` slots take the next in order; every
  item used once before repeats. Without `kinds` the original round-robin is untouched.
  `expandTemplateForMedia(template, count, targetDuration?, roles?)` + `applyShotRoles()`: breathers hold
  1.5× (≤ 6 s) with softer motion, opener/closer keep dramatic/decelerate ramps and become `any`.
  **Cinematic Journey** (5 s hero slots = `video`, 3–4 s = `photo`) and **Rapid Fire** (2 s = `video`,
  1–1.5 s = `photo`) now carry typed slots; the other ten stay `any`.
- `src/lib/story-apply.ts` — pure. `storyKeyForMedia` / `storyKeysForMedia` (`lib-<id>` → `<id>`,
  `lib-<id>-hl<n>` → `<id>#<n>`; uploads → none), `templateIdForStyle`, `orderMediaByStory` (opener leads,
  closer ends, uploads and unselected items stay put), `rolesForMedia`, `buildStoryTextOverrides(expanded,
  plan, ordered, base?)` — title on the first text slot (steps down to `lg` past 4 words / 22 chars), subtitle
  on the second, each later chapter's title on the first single-layout slot of the chapter, the template's
  closing line kept only when it sits in the final third, other stock texts (in both the expanded and the
  base template) hidden with `null`.
- `src/lib/library-client.ts` — `libraryApi.storyPlan({ keys?, force? })`.
- `src/components/StoryCard.tsx` — Story section in the Template step: Write story / Regenerate / Apply story
  (→ "Applied"), title, subtitle, numbered chapters with shot ranges, recommended template + reasons,
  pacing, music mood, provenance line (`Written by qwen3.5:9b` vs heuristic).
- `src/components/TemplateStep.tsx` — renders `StoryCard` (prop `story: StoryControls`), passes media kinds
  to every `assignMediaToSlots` call. `MusicStep` shows "Story suggests <mood> with <pacing> pacing" and
  shapes durations with roles; `RenderStep` expands with roles and assigns with kinds.
- `src/app/page.tsx` — owns `storyPlan`, `storyBusy`, `storyError`, `storyApplied`; `generateStory(force)`;
  `applyStory()` = select the recommended template, reorder media, reset mixer overrides, set text overrides
  (computed on the expanded template with roles). `storyApplied` resets when the shot list changes. The plan
  itself is **not** saved in the project (IndexedDB schema untouched); the template, order and overrides it
  produced are.

### Verified numbers (Phase 3, on the X5 card + photo root)
- Model story for all 64 curated shots (9.5 KB prompt): **22 s**, valid on the first attempt — "Echoes of
  Stone and Light", 5 chapters (Historic Heart → Skyward Views → Neon Dreams → Quiet Rest → Final Passage)
  that match the trip's actual arc, template `cinematic` with 3 reasons, steady pacing. Second call: cached.
- Model story for a 12-shot auto-pick (3.3 KB prompt): **8.8 s** — "Four Days of Sun and Stone", 4 chapters,
  `summer`, "upbeat acoustic folk".
- Heuristic path (vision model pointed at a non-existent tag, `force:true`): instant, 6 date-gap chapters,
  `neon` from arcade captions; `POST /api/curation/analyse` correctly 503s in that state; setting restored.
- Apply: Summer Vibes selected; editor lists exactly the story's texts (title, subtitle, 2 chapter titles) —
  stock template texts hidden in both the base and expanded views; preview shows the title on slot 1 and the
  chapter titles on slots 6, 8 and 12 (slot 12 is beyond the 8-slot base template — expanded-index overrides
  render). Music step shows the mood/pacing note. Export (720p, 12 slots, 49.6 s, 14.6 MB): frames pulled
  from the MP4 show the title at 2 s, "City Heights and Depths" at 23 s and "The Quiet Departure" at 45–47 s.
  That last one exposed a pre-existing bug — the export path only drew text on slots with a base
  `textOverlay`, so user-added text (and chapter titles on bare slots) previewed but never exported.
  Preview and both export paths now share one `drawSlotText` helper in `RenderStep.tsx`.
- One export run out of three **hung** at "Rendering slot 7 of 12" in a browser tab that had been open for
  ~90 min (all video elements were healthy: readyState 4, not seeking, no error; seeks on a fresh element
  worked). Two runs from a freshly loaded page completed. Not reproduced; recorded as a gap below.
- Pure checks (10 story + 16 curation, in `/tmp`): context keys/downsampling, validation clamps and chapter
  normalisation, heuristic limits, prompt contains no paths, kind-aware assignment (all media used once,
  fallbacks), role shaping, ordering/overrides.
- `tsc` + `next build` pass. `pmset -g therm`: no warnings; the story call holds the inference lock for
  ~10–25 s and interleaves with background grading.

### Known gaps / notes
- **Export can hang in a long-lived tab** (seen once in three runs, at a slot→slot transition; fresh page
  loads export fine). `seekToTime` and `writeFrame` have no timeouts, so a lost `seeked` event or a dead
  ffmpeg.wasm worker stalls forever with no error. Worth a bounded wait + surfaced error in Phase 4/5 if it
  recurs; not changed blind.
- The Template step's timeline and text editor still show the **base** template while render uses the
  expanded one (pre-existing); story overrides beyond the base slot count render but are not editable there.
- Split-screen slots only draw text when the slot has a base `textOverlay` (pre-existing render path); the
  story places chapter titles on single-layout slots to avoid it.
- Photos library needs Full Disk Access for the launching app (Phase 2 note); happy path still unverified.
- `highlightCap = round(duration/150)` → one moment for clips under 225 s; consider `ceil`.
- Cache GC for orphaned artefacts (thumbs, proxies, highlight clips, story plans) is not implemented.
- Header overlaps the step nav at ~768 px (pre-existing).

## 3. Phase 4 scope — Settings + Gemini provider

Goal: a Settings page for performance profile and model choice, and an **opt-in** `GeminiProvider` behind
the existing `VisionProvider` boundary, with the API key living only in the browser.

### 3.1 Settings page (`src/app/settings/page.tsx`, link from `Header.tsx`)
- Performance profile (quiet / balanced / fast) — `PUT /api/settings` already exists.
- Vision model: list from `/api/system/capabilities` → `ollama.models`; pick one; show pulled/not-pulled; a
  "Pull" action is out of scope unless trivial (`POST /api/pull` streams progress) — if you add it, keep it on
  the `model` lane and cancellable.
- Provider toggle: `local` (Ollama, default) | `gemini`. Stored **in the browser** (IndexedDB `settings`
  store via `src/lib/db.ts`) together with the key. Never write the key to `state/settings.json`.
- Key entry with masked input, "Test connection" (one tiny text call), and a plain-language privacy note:
  with Gemini on, 512 px frames and captions leave the Mac.

### 3.2 Request plumbing
- Browser attaches `X-PhotoForge-Provider: gemini` and `X-PhotoForge-Gemini-Key: …` headers to
  `/api/curation/analyse`, `/api/story/plan` and any per-item re-analyse. Middleware keeps these routes
  localhost-only; the route handlers read the headers, validate (`/^[A-Za-z0-9_\-]{20,200}$/`), and pass a
  `ProviderChoice` down. **Background jobs** need the key too: keep it in process memory only
  (`globalSingleton` map keyed by a session nonce, expiring after N minutes) and pass through `JobInfo`
  by nonce, never by value; clear on `DELETE /api/system/session`. Log lines must never include the key
  (the redactor covers header-shaped keys, but verify with a grep on the log after a run).
- `createProvider(choice)` in `src/server/ai/index.ts` returns `OllamaProvider` or `GeminiProvider`; the
  curate handler and `planStory` use it instead of `createOllamaProvider` directly.

### 3.3 `GeminiProvider` (`src/server/ai/gemini.ts`)
- Implements `VisionProvider` (`gradeFrame`, `describeImage`, `writeJson`) with `fetch` against the
  current Generative Language REST API; JSON mode via `responseMimeType: application/json` (verify the
  current field names); 512 px JPEG inline data; low media resolution where the API offers it; temperature
  0.1; 60 s timeout; retry once on invalid JSON; map 401/403 → `ProviderUnavailableError` (503 to the UI with
  "check your key"), 429 → back off 2 s then fail the item as `pending` (not `failed`).
- Rate limiting: serialise through the existing inference lock; add a minimum spacing (e.g. 250 ms) between
  calls so a full-card run stays within free-tier RPM. Log the count of calls per job.
- Record provenance: `CurationRecord.provider = 'gemini'`, `model = <model id>`; the UI's provenance lines
  already read these fields.
- Optional (flagged off by default): whole-video agentic mode that uploads the LRV — only if the current API
  supports file upload cleanly and the user turns it on; otherwise leave a stub and note it.

### 3.4 Safety
- The key never touches disk on the server, never appears in logs, never in URLs. Add a unit check that
  `redact()` masks a Gemini-shaped key and a header dump.
- When the provider is `gemini`, show a persistent badge in the LibraryPanel status line ("Cloud AI on —
  frames leave this Mac") and the same note in the StoryCard provenance.

### 3.5 Definition of done
- Settings page works at 375/768/1280 in dark mode; profile + model + provider persist across reloads.
- With a real key entered in the UI: curate one photo and one clip via Gemini (records show
  `provider: gemini`), write one story via Gemini; with the key removed, everything falls back to Ollama.
- Grep the dev log for the key: zero hits. `state/settings.json` never contains it.
- `tsc` + `next build` pass; whole-card run still 0 failed jobs on Ollama; `pmset -g therm` clean.
- Write `docs/handoff/PHASE-5.md` covering **360 signature moves**: AI-directed yaw across a clip (virtual
  pan keyframes between the graded yaw candidates of consecutive samples, rendered with time-varying
  `v360` yaw via `sendcmd`/expression), tiny-planet slot effect (`v360=input=dfisheye:output=sg`), `.insp`
  reframing (photo equivalent of the highlight proxy), and per-highlight yaw editing in the UI.

## 4. Later phases (for continuity)
- **Phase 5 — 360 signature moves** (above).

## 5. How to run
```
npm run dev              # http://127.0.0.1:5190 (localhost-only by design)
npx tsc --noEmit -p tsconfig.json
npx next build           # stop the dev server first, then npm run dev again
curl -s -X POST -H 'content-type: application/json' -d '{}' http://127.0.0.1:5190/api/story/plan | jq .plan
```
App data: `~/Library/Application Support/PhotoForge`. Story plans: `cache/analysis/story-*.json`.
Pure-module checks used in Phases 2–3 lived in `/tmp/pf2/{unit.js,unit-story.js}` with
`/tmp/pf2/tsconfig.test.json` (extends the repo tsconfig; `noEmit:false`, `outDir:/tmp/pf2/build`,
`module:commonjs`, `target:es2020`, includes `src/server/**`, `src/types/**`, `src/lib/templates.ts`,
`src/lib/story-apply.ts`); a small `Module._resolveFilename` shim maps `@/` to the build dir. Recreate as needed.
