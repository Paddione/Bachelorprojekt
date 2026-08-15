import React, { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { Icons } from './Icons';
import type { Client, ProfileField, Screen } from '../lib/types';

export function ProfileEditor({ client, onNav }: { client: Client; onNav: (s: Screen) => void }) {
  const [fields, setFields] = useState<ProfileField[]>([]);

  useEffect(() => {
    api.getProfile(client.id).then((r) => setFields(r.fields)).catch(() => setFields([]));
  }, [client.id]);

  const toggle = (i: number) => setFields((fs) => fs.map((f, j) => j === i ? { ...f, active: !f.active } : f));
  const edit = (i: number, v: string) => setFields((fs) => fs.map((f, j) => j === i ? { ...f, value: v } : f));
  const save = async () => { await api.upsertProfile(client.id, fields); onNav({ kind: 'akte', client }); };

  const active = fields.filter((f) => f.active).length;

  return (
    <div className="screen">
      <div className="wrap">
        <button className="btn btn-quiet btn-sm" style={{ marginBottom: 14, paddingInline: 0 }} onClick={() => onNav({ kind: 'akte', client })}><Icons.back />Zurück zur Akte</button>
        <div className="page-head">
          <div className="eyebrow">KI-Profil · {client.name}</div>
          <div className="between" style={{ alignItems: 'flex-end' }}>
            <h1>Profil für die <em>KI-Anfrage</em></h1>
            <span className="pill pill-aktiv"><span className="dot dot-aktiv" />{active} aktiv</span>
          </div>
        </div>

        <div className="stack" style={{ gap: 14, maxWidth: 880 }}>
          <div className="card" style={{ padding: '16px 18px', display: 'flex', gap: 12, alignItems: 'flex-start', borderColor: 'var(--brass-d)', background: 'var(--brass-d)' }}>
            <Icons.info style={{ color: 'var(--brass)', width: 18, height: 18, flexShrink: 0, marginTop: 1 }} />
            <p style={{ fontSize: 13.5, color: 'var(--fg-soft)' }}>
              Jeder Profilwert hat ein Kontrollkästchen. <b>Nur markierte Werte</b> werden in die KI-Anfrage übernommen — inaktive Felder bleiben in der Akte, fließen aber nicht in die Session ein. Fragen sind im Admin-Bereich erweiterbar.
            </p>
          </div>

          {fields.map((f, i) => (
            <div key={f.key} className="card" style={{ padding: '18px 20px', display: 'grid', gridTemplateColumns: '34px 1fr', gap: 16, alignItems: 'start', borderColor: f.active ? 'color-mix(in oklch, var(--sage), transparent 72%)' : 'var(--line)', opacity: f.active ? 1 : 0.6 }}>
              <label style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 26, height: 26, cursor: 'pointer' }}>
                <input type="checkbox" checked={f.active} onChange={() => toggle(i)} style={{ position: 'absolute', inset: 0, opacity: 0, cursor: 'pointer' }} />
                <span style={{ width: 22, height: 22, borderRadius: 6, border: '1.5px solid var(--line-2)', display: 'flex', alignItems: 'center', justifyContent: 'center', background: f.active ? 'var(--sage)' : 'transparent', borderColor: f.active ? 'var(--sage)' : 'var(--line-2)' }}>
                  {f.active && <Icons.check size={13} style={{ color: 'var(--ink-900)' }} />}
                </span>
              </label>
              <div>
                <div className="kicker" style={{ marginBottom: 8 }}>{f.label}{f.required ? ' · Pflicht' : ''}</div>
                {f.type === 'textarea'
                  ? <textarea className="textarea" value={f.value} onChange={(e) => edit(i, e.target.value)} rows={2} />
                  : <input className="input" value={f.value} onChange={(e) => edit(i, e.target.value)} />}
                <div className="kicker" style={{ marginTop: 12, color: f.active ? 'var(--sage)' : 'var(--mute-2)' }}>
                  {f.active ? '● Aktiv für Session' : '○ Inaktiv — nicht in KI-Anfrage'}
                </div>
              </div>
            </div>
          ))}

          <div className="between" style={{ marginTop: 6 }}>
            <span />
            <div className="row" style={{ gap: 8 }}>
              <button className="btn btn-ghost" onClick={() => onNav({ kind: 'akte', client })}>Abbrechen</button>
              <button className="btn btn-primary" onClick={save}>Profil speichern</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
