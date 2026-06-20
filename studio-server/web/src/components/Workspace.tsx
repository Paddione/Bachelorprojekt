import React, { useEffect, useRef, useState } from 'react';
import { api } from '../lib/api';
import { Icons } from './Icons';
import { WorkspaceRail } from './WorkspaceRail';
import { PromptEditor } from './PromptEditor';
import { MicDock } from './MicDock';
import { AnswerPanel } from './AnswerPanel';
import { ClipboardPanel } from './ClipboardPanel';
import { TranslationPanel } from './TranslationPanel';
import { HIGHLIGHT_LEVELS } from '../lib/constants';
import type { Client, Level, StandardLevel, Session, Screen } from '../lib/types';

export function Workspace({ session: initial, client, onNav }: { session?: Session; client: Client; onNav: (s: Screen) => void }) {
  const [active, setActive] = useState(0);
  const [levels, setLevels] = useState<Level[]>([]);
  const [session, setSession] = useState<Session | null>(initial ?? null);
  const [standards, setStandards] = useState<StandardLevel[]>([]);
  const [prompts, setPrompts] = useState<string[]>([]);
  const [answers, setAnswers] = useState<(string | null)[]>([]);
  const [done, setDone] = useState<boolean[]>([]);
  const [clip, setClip] = useState<Array<{ id: string; text: string }>>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const railRef = useRef<HTMLDivElement>(null);

  // Load standards + create a session if needed
  useEffect(() => {
    api.getStandardLevels().then(setStandards).catch(() => setStandards([]));
  }, []);

  useEffect(() => {
    if (!initial) return;
    setSession(initial);
    setLevels(initial.current_level ? Array.from({ length: 10 }, (_, i) => ({
      session_id: initial.id, level_no: i + 1, prompt: '', prompt_is_default: true,
      answer: null, notes: null, done: false, clipboard: [], generated_at: null,
    } as Level)) : []);
    api.getSession(initial.id).then((out) => {
      setLevels(out.levels);
      setPrompts(out.levels.map((l) => l.prompt));
      setAnswers(out.levels.map((l) => l.answer));
      setDone(out.levels.map((l) => l.done));
    }).catch(() => {});
  }, [initial?.id]);

  const lvl = standards[active];
  const isDefault = !lvl ? true : (prompts[active] ?? '') === lvl.prompt;
  const ans = answers[active];

  const switchLevel = (i: number) => {
    if (i === active) return;
    setActive(i);
    setClip([]);
    setInput('');
  };

  const editPrompt = (v: string) => {
    setPrompts((p) => p.map((x, i) => i === active ? v : x));
  };

  const resetPrompt = async () => {
    if (!session) return;
    const out = await api.upsertLevel(session.id, active + 1, { reset: true });
    setPrompts((p) => p.map((x, i) => i === active ? out.prompt : x));
  };

  const send = async () => {
    if (!session) return;
    setSending(true);
    try {
      const profile = await api.getProfile(client.id).catch(() => ({ fields: [] }));
      const { answer } = await api.llmAnswer({
        sessionId: session.id,
        levelNo: active + 1,
        prompt: prompts[active],
        input,
        profileFields: profile.fields,
      });
      setAnswers((a) => a.map((x, i) => i === active ? answer : x));
      setClip([]);
      setInput('');
      setDone((d) => d.map((x, i) => i === active ? true : x));
      await api.upsertLevel(session.id, active + 1, { done: true, answer });
    } finally {
      setSending(false);
    }
  };

  const addClip = () => {
    const text = input.trim() || 'Notiz – Platzhalter';
    setClip((c) => [...c, { id: Date.now() + '-' + Math.random().toString(36).slice(2, 8), text }]);
  };
  const removeClip = (id: string) => setClip((c) => c.filter((x) => x.id !== id));

  const onArrowKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); switchLevel(Math.min(9, active + 1)); }
    if (e.key === 'ArrowUp')   { e.preventDefault(); switchLevel(Math.max(0, active - 1)); }
  };

  if (!session) {
    return (
      <div className="screen">
        <div className="wrap">
          <button className="btn btn-quiet btn-sm" style={{ paddingInline: 0 }} onClick={() => onNav({ kind: 'akte', client })}>
            <Icons.back /> Zurück
          </button>
          <p className="kicker" style={{ marginTop: 22 }}>Noch keine Session aktiv — bitte aus der Akte starten.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="ws">
      <WorkspaceRail
        standards={standards}
        active={active}
        done={done}
        highlights={HIGHLIGHT_LEVELS}
        onSelect={switchLevel}
        railRef={railRef}
        onKeyDown={onArrowKey}
      />
      <main className="ws-main">
        <header className="ws-mhead">
          <div>
            <div className="lno">Ebene {lvl?.no ?? '—'} — {client.name}</div>
            <h2>{lvl?.name ?? '—'}</h2>
            <p className="goal">{lvl?.goal ?? ''}</p>
          </div>
          <div className="who">
            <div className="nm serif">{client.name}</div>
            <div className="rl">{client.category} · {client.lang}</div>
            <div className="row" style={{ justifyContent: 'flex-end', marginTop: 10, gap: 8 }}>
              <button className="btn btn-ghost btn-sm" onClick={() => onNav({ kind: 'compare', session, client })}><Icons.split />Vergleich</button>
              <button className="btn btn-ghost btn-sm" onClick={() => window.open(`#/present/${session.id}`, '_blank')}><Icons.present />Präsentation</button>
              <button className="btn btn-ghost btn-sm" onClick={() => window.open(`#/export/${session.id}`, '_blank')}><Icons.printer />Export</button>
            </div>
          </div>
        </header>

        {lvl && (
          <PromptEditor
            levelNo={lvl.no}
            prompt={prompts[active] ?? ''}
            isDefault={isDefault}
            onChange={editPrompt}
            onReset={resetPrompt}
          />
        )}

        <section className="block">
          <div className="block-head">
            <div className="bl"><span className="bt">Eingabe</span></div>
            <span className="kicker">Tastatur + Coach-Mic</span>
          </div>
          <div className="input-dock">
            <textarea
              className="textarea"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Beitrag eingeben — oder über das Mikrofon aufnehmen…"
              aria-label="Eingabefeld"
            />
            <div className="dock-foot">
              <div className="left">
                <MicDock
                  onTranscript={(text) => setInput((t) => (t ? t + ' ' : '') + text)}
                />
              </div>
              <button className="btn btn-primary" onClick={send} disabled={sending}>
                Senden <Icons.send />
              </button>
            </div>
          </div>
        </section>

        <AnswerPanel
          levelNo={(lvl?.no ?? '0')}
          answer={ans}
          onAddToClipboard={addClip}
        />
      </main>

      <aside className="ws-aux" aria-label="Zwischenablage und Übersetzung">
        <ClipboardPanel items={clip} onAdd={addClip} onRemove={removeClip} />
        <TranslationPanel />
      </aside>
    </div>
  );
}
