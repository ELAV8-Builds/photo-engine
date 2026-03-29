# PhotoForge v4.1 — Spec Tracker

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
