import React, { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { Icons } from './Icons';
import type { StandardLevel, StandardProfileField, Screen } from '../lib/types';

export function AdminArea({ onNav }: { onNav: (s: Screen) => void }) {
  const [tab, setTab] = useState<'ebenen' | 'fragen'>('ebenen');

  return (
    <div className="screen">
      <div className="wrap">
        <button className="btn btn-quiet btn-sm" style={{ marginBottom: 14, paddingInline: 0 }} onClick={() => onNav({ kind: 'dashboard' })}><Icons.back />Übersicht</button>
        <div className="page-head">
          <div className="eyebrow">Admin</div>
          <h1>Standards &amp; <em>Vorlagen</em></h1>
        </div>

        <div className="admin-tabs" role="tablist">
          <button role="tab" aria-selected={tab === 'ebenen'} className={'admin-tab' + (tab === 'ebenen' ? ' is-active' : '')} onClick={() => setTab('ebenen')}>10 Ebenen · Standard-Prompts</button>
          <button role="tab" aria-selected={tab === 'fragen'} className={'admin-tab' + (tab === 'fragen' ? ' is-active' : '')} onClick={() => setTab('fragen')}>Standard-Profilfragen</button>
        </div>

        {tab === 'ebenen' ? <AdminLevels /> : <AdminQuestions />}
      </div>
    </div>
  );
}

function AdminLevels() {
  const [levels, setLevels] = useState<StandardLevel[]>([]);
  useEffect(() => { api.getStandardLevels().then(setLevels).catch(() => setLevels([])); }, []);
  const edit = (i: number, field: keyof StandardLevel, v: string) =>
    setLevels((ls) => ls.map((l, j) => j === i ? { ...l, [field]: v } : l));
  const save = async () => { await api.setStandardLevels(levels); };
  return (
    <div className="stack" style={{ gap: 12, maxWidth: 920 }}>
      <div className="card" style={{ padding: '16px 18px', display: 'flex', gap: 12, alignItems: 'flex-start', borderColor: 'var(--brass-d)', background: 'var(--brass-d)' }}>
        <Icons.info style={{ color: 'var(--brass)', width: 18, height: 18, flexShrink: 0, marginTop: 1 }} />
        <p style={{ fontSize: 13.5, color: 'var(--fg-soft)' }}>
          Diese Standard-Prompts werden in jeder neuen Session pro Ebene vorgeladen. Coaches können sie pro Session überschreiben und mit dem Reset-Schalter wieder auf diesen Standard zurücksetzen.
        </p>
      </div>
      {levels.map((l, i) => (
        <div key={l.level_no} className="admin-item">
          <div className="ai-head">
            <div className="row" style={{ gap: 8 }}>
              <span className="ai-no">EBENE {l.level_no}</span>
              <input className="input" style={{ width: 260 }} value={l.name} onChange={(e) => edit(i, 'name', e.target.value)} aria-label={`Name Ebene ${l.level_no}`} />
            </div>
          </div>
          <div className="field">
            <label>Ziel</label>
            <input className="input" value={l.goal} onChange={(e) => edit(i, 'goal', e.target.value)} />
          </div>
          <div className="field">
            <label>Standard-Prompt</label>
            <textarea className="textarea" value={l.prompt} onChange={(e) => edit(i, 'prompt', e.target.value)} rows={3} spellCheck={false} />
          </div>
        </div>
      ))}
      <div className="row" style={{ justifyContent: 'flex-end', marginTop: 6 }}>
        <button className="btn btn-primary" onClick={save}>Standards speichern</button>
      </div>
    </div>
  );
}

function AdminQuestions() {
  const [fields, setFields] = useState<StandardProfileField[]>([]);
  useEffect(() => { api.getStandardProfileFields().then(setFields).catch(() => setFields([])); }, []);
  const edit = (i: number, field: keyof StandardProfileField, v: any) =>
    setFields((fs) => fs.map((f, j) => j === i ? { ...f, [field]: v } : f));
  const save = async () => { await api.setStandardProfileFields(fields); };
  return (
    <div className="stack" style={{ gap: 12, maxWidth: 920 }}>
      <div className="card" style={{ padding: '16px 18px', display: 'flex', gap: 12, alignItems: 'flex-start', borderColor: 'var(--brass-d)', background: 'var(--brass-d)' }}>
        <Icons.info style={{ color: 'var(--brass)', width: 18, height: 18, flexShrink: 0, marginTop: 1 }} />
        <p style={{ fontSize: 13.5, color: 'var(--fg-soft)' }}>
          Diese Felder bilden das Standard-KI-Profil für neue Klient:innen — inhaltlich und strukturell. Typ und Pflichtstatus bestimmen, wie das Feld im Profil-Editor erscheint.
        </p>
      </div>
      {fields.map((f, i) => (
        <div key={f.key} className="admin-item">
          <div className="ai-head">
            <div className="row" style={{ gap: 8 }}>
              <input className="input" style={{ width: 300 }} value={f.label} onChange={(e) => edit(i, 'label', e.target.value)} aria-label="Feldname" />
            </div>
          </div>
          <div className="field">
            <label>Standardwert / Platzhalter</label>
            <input className="input" value={f.value} onChange={(e) => edit(i, 'value', e.target.value)} />
          </div>
          <div className="row" style={{ gap: 14, flexWrap: 'wrap' }}>
            <div className="row" style={{ gap: 8 }}>
              <span className="kicker">Typ</span>
              <div className="row" style={{ border: '1px solid var(--line-2)', borderRadius: 999, overflow: 'hidden' }}>
                <button className="btn btn-sm" style={{ background: f.type === 'text' ? 'var(--brass-d)' : 'transparent', color: f.type === 'text' ? 'var(--brass)' : 'var(--fg-soft)', borderRadius: 0, minHeight: 38 }} onClick={() => edit(i, 'type', 'text')}>Text</button>
                <button className="btn btn-sm" style={{ background: f.type === 'textarea' ? 'var(--brass-d)' : 'transparent', color: f.type === 'textarea' ? 'var(--brass)' : 'var(--fg-soft)', borderRadius: 0, minHeight: 38 }} onClick={() => edit(i, 'type', 'textarea')}>Mehrzeilig</button>
              </div>
            </div>
            <label className="row" style={{ gap: 8, cursor: 'pointer' }}>
              <input type="checkbox" checked={f.required} onChange={() => edit(i, 'required', !f.required)} />
              <span className="kicker">Pflichtfeld</span>
            </label>
            <label className="row" style={{ gap: 8, cursor: 'pointer' }}>
              <input type="checkbox" checked={f.active} onChange={() => edit(i, 'active', !f.active)} />
              <span className="kicker">Standardmäßig aktiv</span>
            </label>
          </div>
        </div>
      ))}
      <div className="row" style={{ justifyContent: 'flex-end', marginTop: 6 }}>
        <button className="btn btn-primary" onClick={save}>Standards speichern</button>
      </div>
    </div>
  );
}
