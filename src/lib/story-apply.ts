/**
 * Story plan → editor state. Pure functions the page uses to turn a
 * `StoryPlan` into a template choice, a shot order, per-slot roles and text
 * overrides. Nothing here mutates SMART_TEMPLATES or the media array.
 *
 * Slot i shows the i-th selected media item, so "shot index" in the plan maps
 * to a slot through the ordered key list.
 */

import type { MediaFile, SmartTemplate, TextOverlayOverride } from '@/types';
import type { ShotRole, StoryPlan, StoryTemplateStyle } from '@/types/library';
import { SMART_TEMPLATES } from './templates';

/** Story key for a project media item: `itemId` or `itemId#n`; null for uploads (no curation record). */
export function storyKeyForMedia(m: MediaFile): string | null {
  if (!m.libraryItemId) return null;
  const hl = /-hl(\d+)$/.exec(m.id);
  return hl ? `${m.libraryItemId}#${hl[1]}` : m.libraryItemId;
}

/** Keys for the selected library-backed media, in project order. */
export function storyKeysForMedia(media: MediaFile[]): string[] {
  return media.filter((m) => m.selected).map(storyKeyForMedia).filter((k): k is string => !!k);
}

export function templateIdForStyle(style: StoryTemplateStyle): string | null {
  return SMART_TEMPLATES.find((t) => t.style === style)?.id ?? null;
}

/**
 * Reorder the selected media so the story's opener leads and its closer
 * ends; everything else keeps its current order. Items the plan does not
 * know (uploads, unselected) stay exactly where they are.
 */
export function orderMediaByStory(media: MediaFile[], plan: StoryPlan): MediaFile[] {
  const roleByKey = new Map<string, ShotRole>();
  plan.shotList.forEach((s) => {
    const key = plan.keys[s.index];
    if (key) roleByKey.set(key, s.role);
  });
  const movable = media.filter((m) => m.selected && roleByKey.has(storyKeyForMedia(m) ?? ''));
  if (movable.length < 2) return media;

  const opener = movable.find((m) => roleByKey.get(storyKeyForMedia(m)!) === 'opener');
  const closer = movable.find((m) => roleByKey.get(storyKeyForMedia(m)!) === 'closer' && m !== opener);
  const middle = movable.filter((m) => m !== opener && m !== closer);
  const sequence = [...(opener ? [opener] : []), ...middle, ...(closer ? [closer] : [])];

  let k = 0;
  return media.map((m) => (movable.includes(m) ? { ...sequence[k++], order: m.order } : m));
}

/** Roles per slot for the given (already ordered) selected media; `beat` where the plan is silent. */
export function rolesForMedia(orderedMedia: MediaFile[], plan: StoryPlan): ShotRole[] {
  const roleByKey = new Map<string, ShotRole>();
  plan.shotList.forEach((s) => {
    const key = plan.keys[s.index];
    if (key) roleByKey.set(key, s.role);
  });
  return orderedMedia.filter((m) => m.selected).map((m) => roleByKey.get(storyKeyForMedia(m) ?? '') ?? 'beat');
}

function isSingle(template: SmartTemplate, slot: number): boolean {
  const layout = template.slots[slot]?.layout;
  return !layout || layout === 'single';
}

/**
 * Text overrides that tell the story: title on the first text slot, subtitle
 * on the second, each chapter title on the first slot of that chapter, the
 * template's closing text kept. Other stock template texts are hidden so the
 * montage speaks with one voice. Keyed by expanded-slot index.
 */
export function buildStoryTextOverrides(
  template: SmartTemplate,
  plan: StoryPlan,
  orderedMedia: MediaFile[],
  /** The un-expanded template the Template step edits; its stock texts are hidden too so both views agree. */
  baseTemplate?: SmartTemplate,
): Record<number, TextOverlayOverride> {
  const keys = orderedMedia.filter((m) => m.selected).map(storyKeyForMedia);
  const slotForPlanIndex = (idx: number): number => {
    const key = plan.keys[idx];
    const slot = key ? keys.indexOf(key) : -1;
    return slot === -1 ? Math.min(idx, template.slots.length - 1) : slot;
  };

  const textSlots = template.slots.map((s, i) => (s.textOverlay ? i : -1)).filter((i) => i !== -1);
  const overrides: Record<number, TextOverlayOverride> = {};
  const used = new Set<number>();

  const place = (slot: number, text: string, style: 'title' | 'subtitle' | 'chapter'): boolean => {
    if (!text || slot < 0 || slot >= template.slots.length || used.has(slot)) return false;
    const base = template.slots[slot].textOverlay;
    if (base) {
      // Long titles overflow the templates' xl display sizes; step down to lg.
      const longTitle = style === 'title' && (text.length > 22 || text.split(' ').length > 4);
      overrides[slot] = style === 'title' ? (longTitle ? { text, fontSize: 'lg' } : { text }) : { text, fontSize: style === 'subtitle' ? 'md' : 'lg' };
    } else if (isSingle(template, slot)) {
      overrides[slot] = {
        text,
        position: style === 'subtitle' ? 'bottom' : 'center',
        fontSize: style === 'title' ? 'xl' : style === 'subtitle' ? 'md' : 'lg',
        fontWeight: 'bold',
        animation: style === 'chapter' ? 'slide-up' : 'fade-in',
        color: '#ffffff',
      };
    } else {
      return false;
    }
    used.add(slot);
    return true;
  };

  place(textSlots[0] ?? 0, plan.title, 'title');
  if (plan.subtitle) place(textSlots[1] ?? 1, plan.subtitle, 'subtitle');

  plan.chapters.forEach((chapter, i) => {
    if (i === 0) return; // the title already introduces the first chapter
    const start = slotForPlanIndex(chapter.startIndex);
    const end = slotForPlanIndex(chapter.endIndex);
    for (let slot = start; slot <= end; slot++) if (place(slot, chapter.title, 'chapter')) break;
  });

  // Keep the template's closing line when it really closes (final third); hide other stock texts.
  const closing = textSlots[textSlots.length - 1];
  const closesLate = closing !== undefined && closing >= Math.floor((template.slots.length * 2) / 3);
  const baseTextSlots = baseTemplate ? baseTemplate.slots.map((s, i) => (s.textOverlay ? i : -1)).filter((i) => i !== -1) : [];
  for (const slot of Array.from(new Set([...textSlots, ...baseTextSlots]))) {
    if (used.has(slot)) continue;
    if (slot === closing && closesLate && textSlots.length > 1) continue;
    overrides[slot] = null;
  }
  return overrides;
}
