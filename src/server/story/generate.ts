/**
 * Story generation — one text-only model call over the story context,
 * validated deterministically, with the heuristic plan as the fallback.
 * Plans are cached per shot list under cache/analysis/story-<hash>.json.
 */

import crypto from 'crypto';
import fsp from 'fs/promises';
import { assertServer, dataPath, fileExists, writeJsonAtomic } from '../runtime';
import { createLogger } from '../log';
import { InvalidModelOutputError, ProviderUnavailableError, type VisionProvider } from '../ai/provider';
import { heuristicStoryPlan } from './heuristic';
import { InvalidStoryError, STORY_LIMITS, STORY_TEMPLATE_STYLES, validateStoryPlan } from './validate';
import type { StoryContext, StoryPlan, StoryTemplateStyle } from '@/types/library';

assertServer();

const log = createLogger('story');

/** One line per template so the model can match mood and content. Ordered like STORY_TEMPLATE_STYLES. */
export const TEMPLATE_CATALOG: Record<StoryTemplateStyle, string> = {
  cinematic: 'slow, elegant hero shots with gentle zoom — travel, landmarks, portraits',
  dynamic: 'fast 1–2 s cuts, punchy transitions — events, sport, crowds, high energy',
  minimal: 'simple fades, even pacing, no gimmicks — portfolios, calm family albums',
  retro: 'vintage VHS look, scanlines, nostalgic — throwback, childhood, road trips',
  glitch: 'digital RGB splits and neon accents — bold tech, gaming, urban night',
  parallax: 'layered depth motion centred on faces — portraits, editorial, couples',
  summer: 'sun-soaked warm tones and lens flares — beach, pool, vacation daylight',
  winter: 'cool blue tones and snowfall — snow, holidays, cosy indoor winter',
  party: 'confetti, neon, explosive fast cuts — birthdays, celebrations, nights out',
  electric: 'lightning sparks and electric blue accents — concerts, arcades, high voltage',
  golden: 'sunset warmth and soft flares — weddings, romance, evening light',
  neon: 'cyberpunk purple glows and pulsing beats — clubs, arcades, after dark',
};

export function storyPlanPath(keys: string[]): string {
  const hash = crypto.createHash('sha1').update(keys.join('\n')).digest('hex').slice(0, 20);
  return dataPath('analysis', `story-${hash}.json`);
}

export async function loadStoryPlan(keys: string[]): Promise<StoryPlan | null> {
  const p = storyPlanPath(keys);
  if (!(await fileExists(p))) return null;
  try {
    const plan = JSON.parse(await fsp.readFile(p, 'utf8')) as StoryPlan;
    return plan.version === 1 ? plan : null;
  } catch {
    return null;
  }
}

export async function saveStoryPlan(plan: StoryPlan): Promise<void> {
  await writeJsonAtomic(storyPlanPath(plan.keys), plan);
}

function fmtTime(ms: number): string {
  return new Date(ms).toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

/** The text the model sees. Captions, scene words, kinds, times and scores only. */
export function buildStoryPrompt(ctx: StoryContext): string {
  const L = STORY_LIMITS;
  const catalog = STORY_TEMPLATE_STYLES.map((s) => `- ${s}: ${TEMPLATE_CATALOG[s]}`).join('\n');
  const shots = ctx.entries
    .map((e) => {
      const kind = e.kind === 'video' ? `${e.is360 ? '360 video' : 'video'} ${Math.round(e.durationSec ?? 4)}s` : 'photo';
      const who = e.faces ? 'faces' : e.people ? 'people' : 'no people';
      return `${e.index}. [${fmtTime(e.at)}] ${kind}, ${who}, score ${e.score.toFixed(2)}: ${e.caption || e.scene || 'untitled'}${e.scene && e.caption ? ` (${e.scene})` : ''}`;
    })
    .join('\n');
  const span = ctx.dayCount === 1 ? 'one day' : `${ctx.dayCount} days`;

  return [
    'You are the editor of a short personal travel montage. Below are the shots in time order, spanning ' + span + '.',
    'Write the story for this montage. Return ONLY a JSON object with exactly these keys:',
    `{"title": "<= ${L.titleWords} words", "subtitle": "<= ${L.subtitleWords} words",`,
    ` "chapters": [{"title": "<= ${L.chapterTitleWords} words", "startIndex": n, "endIndex": n}],`,
    ` "template": one of ${STORY_TEMPLATE_STYLES.join(' | ')}, "templateReasons": ["<= ${L.reasonWords} words", ... up to ${L.maxReasons}],`,
    ' "pacing": "calm" | "steady" | "fast", "musicMood": "<= 4 words",',
    ' "shotList": [{"index": n, "role": "opener" | "beat" | "breather" | "closer" | "planet"}]}',
    `Rules: chapters cover the shots in order without overlapping, ${L.minChapterItems}+ shots each, at most ${L.maxChapters};`,
    'exactly one opener and one closer; breathers are calm scenery shots; at most one planet — a "360 video" shot with a striking',
    'surroundings that will be shown as a tiny-planet sphere; title is evocative, not a list; no emojis.',
    'Templates:',
    catalog,
    'Shots:',
    shots,
  ].join('\n');
}

const RETRY_SUFFIX = '\nYour previous answer was not valid. Respond with the JSON object only — no prose, exactly the keys listed, indices within range.';

export interface GenerateOptions {
  provider: VisionProvider;
  signal?: AbortSignal;
}

/**
 * Model plan with one retry, falling back to the heuristic plan on an
 * unreachable model or persistently invalid output. Never throws for those
 * cases — the fallback is the product behaviour, not an error.
 */
export async function generateStoryPlan(ctx: StoryContext, opts: GenerateOptions): Promise<StoryPlan> {
  if (ctx.entries.length === 0) return heuristicStoryPlan(ctx);
  const prompt = buildStoryPrompt(ctx);
  log.info('generating story', { shots: ctx.entries.length, promptChars: prompt.length, model: opts.provider.model });

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const raw = await opts.provider.writeJson(attempt === 0 ? prompt : prompt + RETRY_SUFFIX, { signal: opts.signal, label: 'story' });
      const plan = validateStoryPlan(raw, ctx, { model: opts.provider.model });
      log.info('story from model', { title: plan.title, template: plan.templateStyle, chapters: plan.chapters.length });
      return plan;
    } catch (err) {
      if (err instanceof ProviderUnavailableError) {
        log.warn('model unavailable; using heuristic story', { error: err.message });
        break;
      }
      if (err instanceof InvalidStoryError || err instanceof InvalidModelOutputError) {
        log.warn('invalid story from model', { attempt, error: err.message });
        continue;
      }
      if (opts.signal?.aborted) throw err;
      log.warn('story generation failed; using heuristic', { error: (err as Error).message });
      break;
    }
  }
  return heuristicStoryPlan(ctx);
}
