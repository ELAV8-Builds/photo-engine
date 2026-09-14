'use client';

/**
 * StoryCard — the story layer's face in the Template step: title, subtitle,
 * chapters, the recommended template with its reasons, pacing and music mood.
 * "Apply" hands the plan to the page (template + shot order + text overrides);
 * everything it sets stays editable in the usual controls.
 */

import type { StoryPlan } from '@/types/library';
import { SMART_TEMPLATES } from '@/lib/templates';

interface StoryCardProps {
  plan: StoryPlan | null;
  busy: boolean;
  error: string | null;
  /** Library-backed shots exist in the project (uploads have no captions to reason over). */
  available: boolean;
  /** The plan's recommended template is the one currently selected and its texts are applied. */
  applied: boolean;
  onGenerate: (force: boolean) => void;
  onApply: () => void;
}

export default function StoryCard({ plan, busy, error, available, applied, onGenerate, onApply }: StoryCardProps) {
  const recommended = plan ? SMART_TEMPLATES.find((t) => t.style === plan.templateStyle) : null;

  return (
    <section className="card-glow p-5 space-y-4" aria-labelledby="story-heading">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 id="story-heading" className="text-sm font-bold text-white flex items-center gap-2">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" className="text-accent-gold" strokeWidth="2" aria-hidden="true">
              <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
              <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
            </svg>
            Story
          </h3>
          <p className="text-xs text-text-muted mt-1">
            {available
              ? 'A title, chapters and a template suggestion written from what is actually in your shots. Runs on this Mac.'
              : 'Add photos or moments from your library to write a story — uploads have nothing to read yet.'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => onGenerate(!!plan)}
            disabled={!available || busy}
            className="btn-outline !py-1.5 !px-4 !rounded-full text-xs disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {busy ? 'Writing…' : plan ? 'Regenerate' : 'Write story'}
          </button>
          {plan && (
            <button
              type="button"
              onClick={onApply}
              disabled={busy || applied}
              className="btn-gold !py-1.5 !px-4 !rounded-full text-xs"
              title={applied ? 'This story is applied' : `Select ${recommended?.name ?? 'the template'}, order the shots and set the titles`}
            >
              {applied ? 'Applied' : 'Apply story'}
            </button>
          )}
        </div>
      </div>

      {error && (
        <p role="alert" className="text-sm text-red-400 bg-red-500/5 border border-red-500/30 rounded-xl px-4 py-3">
          {error}
        </p>
      )}

      {plan && (
        <div className="grid gap-4 sm:grid-cols-[1.4fr_1fr]">
          <div className="space-y-3 min-w-0">
            <div>
              <p className="text-white font-semibold text-lg leading-tight">{plan.title}</p>
              {plan.subtitle && <p className="text-sm text-text-secondary mt-1">{plan.subtitle}</p>}
            </div>
            {plan.chapters.length > 0 && (
              <ol className="space-y-1" aria-label="Chapters">
                {plan.chapters.map((c, i) => (
                  <li key={`${c.startIndex}-${i}`} className="flex items-center gap-3 text-sm">
                    <span className="font-mono text-[11px] text-text-muted w-5 text-right">{i + 1}</span>
                    <span className="text-white">{c.title}</span>
                    <span className="font-mono text-[11px] text-text-muted">
                      shots {c.startIndex + 1}–{c.endIndex + 1}
                    </span>
                  </li>
                ))}
              </ol>
            )}
          </div>
          <dl className="space-y-3 text-sm bg-bg-input/60 border border-border-subtle rounded-xl px-4 py-3">
            <div>
              <dt className="text-[11px] uppercase tracking-wide text-text-muted">Template</dt>
              <dd className="text-white font-medium">
                {recommended?.emoji} {recommended?.name ?? plan.templateStyle}
              </dd>
              {plan.templateReasons.length > 0 && (
                <ul className="mt-1 space-y-0.5">
                  {plan.templateReasons.map((r, i) => (
                    <li key={i} className="text-xs text-text-secondary">
                      · {r}
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div className="flex gap-6">
              <div>
                <dt className="text-[11px] uppercase tracking-wide text-text-muted">Pacing</dt>
                <dd className="text-white capitalize">{plan.pacing}</dd>
              </div>
              {plan.musicMood && (
                <div>
                  <dt className="text-[11px] uppercase tracking-wide text-text-muted">Music mood</dt>
                  <dd className="text-white">{plan.musicMood}</dd>
                </div>
              )}
            </div>
            <p className="text-[11px] text-text-muted">
              {plan.source === 'model' ? `Written by ${plan.model ?? 'the local model'}` : 'Built from dates and captions (model unavailable)'} · {plan.keys.length} shots
            </p>
          </dl>
        </div>
      )}
    </section>
  );
}
