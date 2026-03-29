# PhotoForge — Continue from v1.0

## What Was Completed
- PhotoForge v1.0 built and deployed
- 4-step wizard: Photos → Template → Music → Export
- Face detection, 6 templates, music upload + yt-dlp, Canvas/MediaRecorder rendering
- Deployed to https://photo-engine-sooty.vercel.app
- GitHub: https://github.com/ELAV8-Builds/photo-engine
- Vercel: deploy with `--scope elav-8` (token in tokens.md)

## Bugs to Fix

### 1. HEIC Support (CRITICAL)
- Browsers can't render HEIC natively — images don't preview
- Uploading HEIC-only batches causes errors
- **Fix**: Convert HEIC to JPEG on upload using `heic2any` library (client-side) or server-side with `sharp`
- Install: `npm install heic2any` (client-side JS library)
- In PhotoStep.tsx `processFiles()`: detect `.heic/.heif` files, convert to JPEG blob, then create object URL from converted blob

### 2. Pull Latest Code from GitHub
- Beau may have made changes to the repo
- Run `git pull origin master` before starting fixes

## New Features to Build

### 3. Video Support
- Accept video files (MP4, MOV, WebM) alongside photos
- Auto-detect video duration
- Allow trimming/clipping videos in the UI
- Integrate video clips into the presentation timeline
- Videos play during their slot in the template

### 4. Smart Pre-Built Templates (MAJOR REWORK)
Current templates are just style presets. Beau wants CapCut/Insta360-style templates:
- **Pre-built timeline**: Each template has a fixed structure (e.g., "3s photo, 2s video, 4s photo, 1s transition, 3s photo...")
- **Dynamic timing**: Some slots hold media longer than others — this is pre-defined in the template
- **Preview before committing**: Show animated preview of what the template will look like with user's media
- **Smart placement**: Drop all media in, template auto-assigns what goes where
- **Pre-synced to music**: Templates know exactly how long they are, synced to beat markers

Template structure should be:
```ts
interface TemplateSlot {
  type: 'photo' | 'video' | 'any';
  duration: number; // seconds
  transition: string; // 'fade', 'slide', 'zoom', etc.
  effect: string; // 'ken-burns', 'parallax', 'static', etc.
  holdPoint?: 'face' | 'center' | 'rule-of-thirds';
}

interface SmartTemplate {
  id: string;
  name: string;
  totalDuration: number;
  slots: TemplateSlot[];
  musicBpm?: number;
  previewUrl?: string; // animated preview
}
```

### 5. Template Preview
- When hovering/clicking a template, show an animated preview
- Use actual user photos in the preview
- Show timeline with slot durations marked

## Architecture Notes
- Project: `/workspace/group/photo-engine/`
- Main page: `src/app/page.tsx` — step wizard state
- Photo upload: `src/components/PhotoStep.tsx`
- Templates: `src/components/TemplateStep.tsx` + `src/lib/templates.ts`
- Music: `src/components/MusicStep.tsx`
- Render: `src/components/RenderStep.tsx`
- Face detect: `src/lib/face-detect.ts`
- Theme: Black (#0a0a0f) & Gold (#FFD700) — tailwind config in `tailwind.config.ts`

## Priority Order
1. Pull latest from GitHub
2. Fix HEIC support (heic2any conversion)
3. Add video file support (accept + preview + trim)
4. Rework templates to smart pre-built format
5. Add template preview
6. Test, build, deploy

## Key Decisions
- Client-side HEIC conversion with heic2any (no server needed)
- Video trimming via HTML5 video element + Canvas capture
- Templates become data-driven timelines, not just style presets
- Keep client-side rendering approach (Canvas + MediaRecorder)
