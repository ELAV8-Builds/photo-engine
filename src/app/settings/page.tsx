'use client';

/**
 * Settings — performance profile and local model (server settings), and the
 * AI provider choice with an optional Gemini key (browser-owned: IndexedDB,
 * forwarded per request, never written to disk on the server).
 */

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { PerformanceProfile, ServerSettings, SystemCapabilities } from '@/types/library';
import { libraryApi, LibraryApiError } from '@/lib/library-client';
import {
  cloudProviderActive,
  DEFAULT_GEMINI_MODEL,
  loadProviderSettings,
  saveProviderSettings,
  type AiProviderSettings,
} from '@/lib/provider-settings';
import StorageCard from '@/components/StorageCard';

const PROFILES: Array<{ id: PerformanceProfile; label: string; detail: string }> = [
  { id: 'quiet', label: 'Quiet', detail: 'nice 19 · 2 threads · slowest import, invisible footprint' },
  { id: 'balanced', label: 'Balanced', detail: 'nice 15 · 4 threads · default' },
  { id: 'fast', label: 'Fast', detail: 'nice 5 · 8 threads · still one job per lane' },
];

function errorText(err: unknown): string {
  if (err instanceof LibraryApiError || err instanceof Error) return err.message;
  return 'Something went wrong';
}

export default function SettingsPage() {
  const router = useRouter();
  const [caps, setCaps] = useState<SystemCapabilities | null>(null);
  const [server, setServer] = useState<ServerSettings | null>(null);
  const [ai, setAi] = useState<AiProviderSettings | null>(null);
  const [keyVisible, setKeyVisible] = useState(false);
  const [saving, setSaving] = useState<'profile' | 'model' | 'ai' | 'test' | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dirtyAi, setDirtyAi] = useState(false);
  const [aiSaveStatus, setAiSaveStatus] = useState<'idle' | 'saved'>('idle');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [c, s, p] = await Promise.all([libraryApi.capabilities(), libraryApi.settings(), loadProviderSettings()]);
        if (cancelled) return;
        setCaps(c);
        setServer(s);
        setAi(p);
      } catch (err) {
        if (!cancelled) setError(errorText(err));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const flash = useCallback((msg: string) => {
    setNotice(msg);
    setError(null);
  }, []);
  const flashError = useCallback((msg: string) => setError(msg), []);

  const updateServer = useCallback(async (patch: Partial<ServerSettings>, kind: 'profile' | 'model') => {
    setSaving(kind);
    try {
      setServer(await libraryApi.updateSettings(patch));
      flash(kind === 'profile' ? 'Performance profile saved. New jobs use it immediately.' : 'Local model saved.');
    } catch (err) {
      setError(errorText(err));
    } finally {
      setSaving(null);
    }
  }, []);

  const saveAi = useCallback(async () => {
    if (!ai) return;
    setSaving('ai');
    try {
      const saved = await saveProviderSettings(ai);
      setAi(saved);
      setDirtyAi(false);
      setAiSaveStatus('saved');
      setTimeout(() => setAiSaveStatus('idle'), 2000);
      if (!cloudProviderActive(saved)) await libraryApi.clearCloudSession().catch(() => undefined);
      libraryApi.capabilities().then(setCaps).catch(() => undefined);
      flash(cloudProviderActive(saved) ? 'Gemini is on. Frames and captions will be sent to Google when you analyse or write a story.' : 'Local AI only. Nothing leaves this Mac.');
    } catch (err) {
      setError(errorText(err));
    } finally {
      setSaving(null);
    }
  }, [ai]);

  const testConnection = useCallback(async () => {
    if (!ai) return;
    setSaving('test');
    try {
      const res = await libraryApi.testProvider(ai);
      flash(`Connected: ${res.provider} · ${res.model}`);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setSaving(null);
    }
  }, [ai]);

  const forgetKey = useCallback(async () => {
    if (!ai) return;
    const next: AiProviderSettings = { ...ai, provider: 'local', geminiKey: '' };
    setAi(next);
    setSaving('ai');
    try {
      await saveProviderSettings(next);
      await libraryApi.clearCloudSession().catch(() => undefined);
      setDirtyAi(false);
      libraryApi.capabilities().then(setCaps).catch(() => undefined);
      flash('Gemini key forgotten here and on the local server.');
    } catch (err) {
      setError(errorText(err));
    } finally {
      setSaving(null);
    }
  }, [ai]);

  const models = caps?.ollama.models ?? [];
  const modelOptions = server && !models.includes(server.visionModel) ? [server.visionModel, ...models] : models;

  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b border-border-subtle bg-bg-card/80 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 flex items-center justify-between h-16">
          <div className="flex items-center gap-3">
            <img src="/icons/logo.svg" alt="" className="w-8 h-8" aria-hidden="true" />
            <div>
              <h1 className="text-sm font-bold text-white tracking-wide">
                PHOTO<span className="text-accent-gold">FORGE</span>
              </h1>
              <p className="text-[10px] text-text-muted font-mono tracking-widest uppercase">Settings</p>
            </div>
          </div>
          <button type="button" onClick={() => router.push('/')} className="btn-outline !py-2 !px-4 !rounded-full text-xs">
            Back to editor
          </button>
        </div>
      </header>

      <main id="main-content" className="flex-1 max-w-5xl mx-auto w-full px-4 sm:px-6 py-8 space-y-6">
        {(notice || error) && (
          <div
            role={error ? 'alert' : 'status'}
            className={`flex items-start justify-between gap-3 text-sm rounded-xl px-4 py-3 border ${
              error ? 'text-red-400 bg-red-500/5 border-red-500/30' : 'text-text-secondary bg-accent-gold/5 border-border-gold'
            }`}
          >
            <span className="min-w-0 break-words">{error ?? notice}</span>
            <button
              type="button"
              onClick={() => {
                setError(null);
                setNotice(null);
              }}
              className="text-text-muted hover:text-white shrink-0"
              aria-label="Dismiss"
            >
              ×
            </button>
          </div>
        )}

        {/* Performance */}
        <section className="card-glow p-5 sm:p-6 space-y-4" aria-labelledby="perf-heading">
          <div>
            <h2 id="perf-heading" className="text-white font-semibold text-base">
              Performance
            </h2>
            <p className="text-text-muted text-sm mt-1">
              How much of this Mac background work may use. The thread cap bounds both ffmpeg and the local AI model (Ollama), and exactly one heavy job runs per lane regardless.
            </p>
          </div>
          <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Performance profile">
            {PROFILES.map((p) => {
              const active = server?.performanceProfile === p.id;
              return (
                <button
                  key={p.id}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  disabled={!server || saving === 'profile'}
                  onClick={() => updateServer({ performanceProfile: p.id }, 'profile')}
                  className={`text-left rounded-xl border px-4 py-3 min-w-[12rem] transition-colors ${
                    active ? 'border-border-gold bg-accent-gold/10' : 'border-border-subtle bg-bg-input/60 hover:border-border-gold'
                  }`}
                >
                  <span className={`block text-sm font-semibold ${active ? 'text-accent-gold' : 'text-white'}`}>{p.label}</span>
                  <span className="block text-[11px] font-mono text-text-muted mt-1">{p.detail}</span>
                </button>
              );
            })}
          </div>
        </section>

        {/* Local model */}
        <section className="card-glow p-5 sm:p-6 space-y-4" aria-labelledby="model-heading">
          <div>
            <h2 id="model-heading" className="text-white font-semibold text-base">
              Local model
            </h2>
            <p className="text-text-muted text-sm mt-1">
              The Ollama vision model that grades frames and writes stories on this Mac.{' '}
              {!caps ? (
                <span className="text-text-muted">Checking Ollama…</span>
              ) : caps.ollama.running ? (
                <span className="text-text-secondary">
                  Ollama {caps.ollama.version} is running with {models.length} model{models.length === 1 ? '' : 's'} pulled.
                </span>
              ) : (
                <span className="text-accent-gold">Ollama is not running.</span>
              )}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <label htmlFor="vision-model" className="text-sm text-text-secondary">
              Vision model
            </label>
            <select
              id="vision-model"
              value={server?.visionModel ?? ''}
              disabled={!server || saving === 'model'}
              onChange={(e) => updateServer({ visionModel: e.target.value }, 'model')}
              className="bg-bg-input border border-border-subtle rounded-full px-4 py-2 text-sm font-mono text-white focus:border-border-gold outline-none"
            >
              {modelOptions.map((m) => (
                <option key={m} value={m}>
                  {m}
                  {!models.includes(m) ? ' (not pulled)' : ''}
                </option>
              ))}
            </select>
            {server && !models.includes(server.visionModel) && (
              <span className="text-xs text-text-muted">
                Pull it with <code className="font-mono text-text-secondary">ollama pull {server.visionModel}</code>
              </span>
            )}
          </div>
        </section>

        {/* Provider */}
        <section className="card-glow p-5 sm:p-6 space-y-4" aria-labelledby="provider-heading">
          <div>
            <h2 id="provider-heading" className="text-white font-semibold text-base">
              AI provider
            </h2>
            <p className="text-text-muted text-sm mt-1">
              Local is the default and keeps everything on this Mac. Gemini is opt-in: with it on, 512-px frames and your shot captions are sent to
              Google for grading and story writing. The key is stored in this browser and handed to the local server only for the duration of a job — never written to disk there, never logged.
            </p>
          </div>

          <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="AI provider">
            {(
              [
                { id: 'local', label: 'On this Mac', detail: 'Ollama · private' },
                { id: 'gemini', label: 'Google Gemini', detail: 'cloud · needs an API key' },
              ] as Array<{ id: AiProviderSettings['provider']; label: string; detail: string }>
            ).map((opt) => {
              const active = ai?.provider === opt.id;
              return (
                <button
                  key={opt.id}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  disabled={!ai}
                  onClick={() => {
                    if (!ai) return;
                    setAi({ ...ai, provider: opt.id });
                    setDirtyAi(true);
                  }}
                  className={`text-left rounded-xl border px-4 py-3 min-w-[12rem] transition-colors ${
                    active ? 'border-border-gold bg-accent-gold/10' : 'border-border-subtle bg-bg-input/60 hover:border-border-gold'
                  }`}
                >
                  <span className={`block text-sm font-semibold ${active ? 'text-accent-gold' : 'text-white'}`}>{opt.label}</span>
                  <span className="block text-[11px] font-mono text-text-muted mt-1">{opt.detail}</span>
                </button>
              );
            })}
          </div>

          {ai?.provider === 'gemini' && (
            <div className="space-y-3 bg-bg-input/60 border border-border-subtle rounded-xl px-4 py-4">
              <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
                <div>
                  <label htmlFor="gemini-key" className="block text-xs text-text-muted mb-1">
                    Gemini API key
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      id="gemini-key"
                      type={keyVisible ? 'text' : 'password'}
                      value={ai.geminiKey}
                      onChange={(e) => {
                        setAi({ ...ai, geminiKey: e.target.value });
                        setDirtyAi(true);
                      }}
                      autoComplete="off"
                      spellCheck={false}
                      placeholder="AIza…"
                      className="flex-1 bg-bg-input border border-border-subtle rounded-full px-4 py-2 text-sm font-mono text-white placeholder:text-text-muted focus:border-border-gold outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => setKeyVisible((v) => !v)}
                      className="text-xs text-text-muted hover:text-white px-2 py-2"
                      aria-pressed={keyVisible}
                    >
                      {keyVisible ? 'Hide' : 'Show'}
                    </button>
                  </div>
                </div>
                <div>
                  <label htmlFor="gemini-model" className="block text-xs text-text-muted mb-1">
                    Model
                  </label>
                  <input
                    id="gemini-model"
                    value={ai.geminiModel}
                    onChange={(e) => {
                      setAi({ ...ai, geminiModel: e.target.value });
                      setDirtyAi(true);
                    }}
                    spellCheck={false}
                    placeholder={DEFAULT_GEMINI_MODEL}
                    className="w-full sm:w-56 bg-bg-input border border-border-subtle rounded-full px-4 py-2 text-sm font-mono text-white placeholder:text-text-muted focus:border-border-gold outline-none"
                  />
                </div>
              </div>
              <p className="text-[11px] text-text-muted">
                Default <code className="font-mono">{DEFAULT_GEMINI_MODEL}</code> (stable, low-cost, supports low media resolution). Get a key from Google AI Studio.
              </p>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={saveAi} disabled={!ai || !dirtyAi || saving === 'ai'} className="btn-gold !py-2 !px-4 !rounded-full text-sm">
              {saving === 'ai' ? 'Saving…' : aiSaveStatus === 'saved' ? 'Saved ✓' : 'Save provider'}
            </button>
            <button
              type="button"
              onClick={testConnection}
              disabled={!ai || saving === 'test' || (ai.provider === 'gemini' && ai.geminiKey.length < 20)}
              className="btn-outline !py-2 !px-4 !rounded-full text-sm disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {saving === 'test' ? 'Testing…' : 'Test connection'}
            </button>
            {ai && ai.geminiKey && (
              <button type="button" onClick={forgetKey} disabled={saving === 'ai'} className="text-xs text-text-muted hover:text-red-400 px-2 py-2">
                Forget key
              </button>
            )}
            {caps?.cloudSession.active && (
              <span className="text-[11px] text-text-muted ml-auto">
                A cloud key is currently held in server memory for background jobs (expires after an hour idle).
              </span>
            )}
          </div>
        </section>

        {/* Storage (Phase 6) */}
        <StorageCard appDataDir={caps?.appDataDir} onNotice={flash} onError={flashError} />
      </main>

      <footer className="border-t border-border-subtle py-4">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 flex items-center justify-between text-xs text-text-muted">
          <span className="font-mono">PHOTOFORGE v4.0</span>
          <span>Built by ELAV8</span>
        </div>
      </footer>
    </div>
  );
}
