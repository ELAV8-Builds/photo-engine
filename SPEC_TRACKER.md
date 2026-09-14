# PhotoForge v4.1 — Spec Tracker

## Library & Local AI Curation — Phases 1–5 ✅ COMPLETE (see docs/handoff/DONE.md)
| # | Feature | Status | Notes |
|---|---------|--------|-------|
| L1.1 | Library folders (server-indexed, localhost-only API) | ✅ DONE | `src/server/**`, native macOS folder picker, id-addressed media, Range streaming |
| L1.2 | Background job queue (lanes, nice, pause/resume, crash recovery) | ✅ DONE | `src/server/jobs/*`; durable state is the item index; stale temp sweep at boot |
| L1.3 | Insta360 360° → flat preview proxies (ffmpeg v360) | ✅ DONE | `src/server/media/reframe.ts`; LRV-based, 40× realtime |
| L1.4 | Stage-1 signals + deterministic technical gate | ✅ DONE | `src/server/analysis/*`; brightness/motion/sharpness/audio per second |
| L1.5 | LibraryPanel UI + add-to-project + project save by reference | ✅ DONE | `MediaFile.file` optional; `libraryItemId` |
| L2.1 | Ollama vision provider (`VisionProvider` boundary, health, inference lock) | ✅ DONE | `src/server/ai/*`; qwen3.5:9b, anchored prompt, `keep_alive 5m` |
| L2.2 | Video highlight pipeline (sample → phash dedup → grade → fuse → NMS → refine → 360 yaw pick) | ✅ DONE | `src/server/analysis/highlights.ts`, `frames.ts`, `phash.ts`; partial-progress resume |
| L2.3 | Highlight proxies (flat 1080p clips from the INSV) + per-highlight thumbnails | ✅ DONE | `highlights` job on the ffmpeg lane; `/api/media/[id]/highlight/[n]/stream|thumb` |
| L2.4 | Montage selection (`selectForMontage`) + Auto-pick best N | ✅ DONE | `src/server/curation/select.ts`; `POST /api/curation/select` |
| L2.5 | Thermal watchdog (`pmset -g therm`) pausing the queue | ✅ DONE | `src/server/jobs/thermal.ts`; `thermalPaused` in `/api/jobs` |
| L2.6 | UI: scores, moments, sort, Analyse library, re-analyse, Auto-pick | ✅ DONE | `LibraryPanel.tsx`; highlight entries `lib-<id>-hl<n>` with trims |
| L2.7 | macOS Photos library detection + one-click add as root | ✅ DONE (permission path verified) | `src/server/photos/library.ts`; needs Full Disk Access for the launching app |
| L3.1 | Story context + model pass + deterministic validation + heuristic fallback | ✅ DONE | `src/server/story/*`; `POST /api/story/plan`; cached per shot list |
| L3.2 | Kind-aware slot assignment + role-shaped expansion; typed slots on Cinematic Journey / Rapid Fire | ✅ DONE | `assignMediaToSlots(…, kinds)`, `expandTemplateForMedia(…, roles)`, `applyShotRoles` |
| L3.3 | Story card (write / regenerate / apply) + title, subtitle, chapter overlays; music mood note | ✅ DONE | `StoryCard.tsx`, `src/lib/story-apply.ts`; user-added text now exports (shared `drawSlotText`) |
| L4.1 | `GeminiProvider` behind `VisionProvider` (fetch, JSON mode, low media resolution, minimal thinking) | ✅ DONE (contract verified live; real-key run not verified) | `src/server/ai/gemini.ts`; 429 back-off; unavailability keeps items pending |
| L4.2 | Browser-owned key: IndexedDB + per-request headers; in-memory cloud session for jobs; never on disk/logs | ✅ DONE | `src/lib/provider-settings.ts`, `src/server/ai/{session,index}.ts`; `redact()` checked |
| L4.3 | Settings page (profile, local model, provider, key, test, forget) + header link + cloud badge | ✅ DONE | `src/app/settings/page.tsx`; QA 375/768/1280 |
| L5.1 | AI-directed yaw pan: `pan360` job plans start→peak→end view paths; `sendcmd` delta renders | ✅ DONE | `src/server/analysis/pan-plan.ts`, `src/server/media/pan.ts`; 27/51 windows pan on the card |
| L5.2 | Tiny-planet clips per highlight + `reframe: 'tiny-planet'` slots + story `planet` role | ✅ DONE | `renderTinyPlanetProxy`; Cinematic Journey closer / Summer Vibes opener; `RenderStep.mediaForSlot` |
| L5.3 | Per-highlight yaw editing (ReframePanel, frame preview, PUT view → re-render, versioned URLs) | ✅ DONE | 6 s round-trip verified; user views survive `pan360` |
| L5.4 | `.insp` 360 photo reframing (equirect thumb, flat rendition) gated on 2:1 aspect | ✅ DONE (synthetic file) | Phase 6: verified with a dual-fisheye JPEG cut from an `.lrv`; a real X5 `.insp` is still unverified |

## Library & Local AI Curation — Phase 6 ✅ COMPLETE (see docs/handoff/PHASE-7.md)
| # | Feature | Status | Notes |
|---|---------|--------|-------|
| L6.1 | Cache GC (inventory by artefact class, orphan rules, clear) + Settings "Storage" card | ✅ DONE | `src/server/storage/gc.ts`, `GET|POST /api/system/storage`, `StorageCard.tsx`; 3/3 real orphans cleared, live artefacts untouched; QA 375/768/1280 |
| L6.2 | Bounded waits in `seekToTime` (10 s, media error) and `writeFrame` (20 s) with a visible error | ✅ DONE | export completes (147 s, 8 slots); a stalled seek fails visibly after 10 s instead of hanging |
| L6.3 | User views survive forced re-analysis (per-item memory, matched on time overlap) | ✅ DONE | `src/server/curation/user-views.ts`; 3/3 restored on the whole-card forced run; force also cancels stale `pan360` |
| L6.4 | Verify Gemini / `.insp` / Photos library | ⚠️ PARTIAL | `.insp` verified synthetically; Gemini needs a real key in Settings; Photos needs Full Disk Access |

## Library & Local AI Curation — Phase 7 ✅ COMPLETE (see docs/handoff/PHASE-8.md)
| # | Feature | Status | Notes |
|---|---------|--------|-------|
| L7.1 | Model-lane CPU bound: budget `threads` → Ollama `options.num_thread` per request | ✅ DONE | `src/server/ai/ollama.ts`; measured 5.5→1.0 mean busy cores at balanced (0.6 quiet / 1.7 fast), ≤5% latency cost; whole card 174 jobs, 0 failed, 40/40 therm samples clean |
| L7.2 | Second moment for short clips (runner-up ≥20 s away within 15% of top) | ✅ DONE | `selectPeaks` in `highlights.ts`; 51→77 moments on the card (26 short clips gained one); 3 eye-checked (one boundary case noted); Auto-pick still prefers the stronger |
| L7.3 | Reframe editor: pan strip (start/peak/end via `?t=`), keep-the-pan (shifted path), planet spin (`planetRotationDeg`, owner-approved schema field) | ✅ DONE | `ReframePanel.tsx`, view PUT route, `setHighlightView`, `renderTinyPlanetProxy`; keep-pan round-trip 31 s; +90° spin verified from planet frames |
| L7.4 | Export Cancel (AbortController through render loops + bounded waits; terminate during encode) + slot/frame context in errors | ✅ DONE | `RenderStep.tsx`, `mp4-encoder.ts` (`resetFFmpeg`), `video-frame-extractor.ts`; cancel mid-render → idle + notice; full export 245 s (12 slots, 720p) |
| L7.5 | Base-template text edits reach the expanded render (`TemplateSlot.baseIndex` + `overrideForSlot`) | ✅ DONE | `templates.ts`, `RenderStep.tsx`; "PHASE SEVEN" verified in a decoded frame of the exported MP4 |
| L7.6 | Hygiene: `error` clears when steps recover; yaw frames named by time (`<id>-view-<t>-…`), GC owns them (+ legacy form always orphaned, peak-frame ownership) | ✅ DONE | `index-store.ts`, `record.ts`, `gc.ts`; 0 items with errors after the run; storage 404 files / 2.85 GB, 0 orphans, 0 unrecognised; 21 pure checks |
| L7.7 | Verify Gemini / real `.insp` / Photos library | ⚠️ STILL OWNER-GATED | No key pasted, no Full Disk Access granted, no real `.insp` on the card during Phase 7 |

## Library & Local AI Curation — Phase 8 ✅ COMPLETE (see docs/handoff/PHASE-9.md)
| # | Feature | Status | Notes |
|---|---------|--------|-------|
| L8.1 | Second-moment quality floor: fused score ≥ 0.5 AND within 15% of top | ✅ DONE | `SECOND_MOMENT_MIN_SCORE` in `highlights.ts`; measured all 26 second moments (0.42×3, 0.6×19, 0.65, ~0.7×3 — empty gap 0.42–0.60); floor cut exactly the 3 dark weak-top doubles; after re-curation 24 second moments, all ≥ 0.55, eye-checked near the floor |
| L8.2 | User-view memory v2 (owner-approved): kept pans + planet spins survive re-analysis | ✅ DONE | `user-views.ts` v1→2 (`viewPath` window-relative, `planetRotationDeg`, validated on read); `anchorRememberedPath` re-anchors via clamp→simplify→panDecision; verified live on VID_005 (pan 35→−45 + spin 90° restored exactly after forced re-analysis) |
| L8.3 | Instant export cancel (worker terminate, not frame-by-frame cleanup) + media name in progress card | ✅ DONE | `RenderStep.tsx`; cancel-to-idle 3 ms / 3 ms / 2 ms at early / mid (slot 6) / late (encoding 50%, ~2,100 frames — was ~17 s); post-cancel export completed (225 s, 12 slots, 720p, 12.3 MB MP4) |
| L8.4 | GC auto-sweep after "Remove folder" (owner-approved) | ✅ DONE | `unregisterRoot` → `clearOrphans()`; throwaway-root test swept 2 stranded files instantly, real roots untouched |
| L8.5 | Hygiene: dead `renderSlotToCanvas`/`renderTransition` removed from RenderStep.tsx | ✅ DONE | `holdFrames`/`drawCover` are also dead but weren't approved for deletion — flagged for Phase 9 |
| L8.6 | Verify Gemini / real `.insp` / Photos library | ⚠️ STILL OWNER-GATED | No key pasted, no Full Disk Access granted, no real `.insp` on the card during Phase 8 |

## Phase 1 — Fix Fundamentals ✅ COMPLETE
| # | Feature | Status | Notes |
|---|---------|--------|-------|
| 1.1 | ffmpeg.wasm MP4 export | ✅ DONE | Replaced WebM MediaRecorder with ffmpeg.wasm H.264 MP4. Downloads as .mp4 |
| 1.2 | Real video frame playback | ✅ DONE | video-frame-extractor.ts — HTMLVideoElement seeked per-frame in preview + export |
| 1.3 | Fade-out on last slot | ✅ DONE | 0.8s fade-to-black default on all templates. Renders in preview + export |

## Phase 2 — Make Templates 10x Better ✅ COMPLETE
| # | Feature | Status | Notes |
|---|---------|--------|-------|
| 2.1 | Split screen / multi-photo layouts | ✅ DONE | split-screen.ts — 2-up-h, 2-up-v, 3-up, 4-grid, PIP. Auto-injected every ~6th slot |
| 2.2 | Transition overlay files | ✅ DONE | transition-overlays.ts — 8 procedural overlays + custom upload support |
| 2.3 | Beat sync | ✅ DONE | beat-detect.ts — Web Audio API peak detection, quantizes slot durations to beats |
| 2.4 | Aggressive speed ramping | ✅ DONE | Every 3rd slot gets a speed preset. Hero slots get dramatic/decelerate |
| 2.5 | Parallax/depth effects | ✅ DONE | 3 depth motions (parallax, depth-zoom, depth-float) using face focal points |

## Files Created This Session
- `src/lib/mp4-encoder.ts` — ffmpeg.wasm wrapper (init, writeFrame, encodeMP4, mixAudio, cleanup)
- `src/lib/video-frame-extractor.ts` — HTMLVideoElement seek + frame extraction
- `src/lib/split-screen.ts` — Multi-photo layout renderer (6 layout modes)
- `src/lib/transition-overlays.ts` — 8 procedural VFX overlays + custom upload
- `src/lib/beat-detect.ts` — Audio beat detection + slot quantization

## Files Modified This Session
- `src/components/RenderStep.tsx` — Rewrote handleClientRender for MP4, video frames, split-screen, overlays, beat sync, fade-out
- `src/types/index.ts` — Added SlotLayout, TransitionOverlayConfig, fadeOutDuration, transitionOverlay
- `src/lib/templates.ts` — Auto-inject split-screen, overlays, speed presets, depth effects in expansion
- `src/lib/effects/motions.ts` — Enhanced parallax, added depth-zoom + depth-float (3 new depth motions)
- `next.config.js` — Added COOP/COEP headers for SharedArrayBuffer

## Completed (Previous Session)
- ✅ 60+ photo support (template expansion)
- ✅ Multi-song playlists with drag-to-reorder
- ✅ Audio preview in RenderStep
- ✅ Face detection on videos
- ✅ Auto-save music to IndexedDB library
- ✅ Auto-create project on export
- ✅ Bug fixes: stale closure, wrong duration, dead code, musicTracks restore
