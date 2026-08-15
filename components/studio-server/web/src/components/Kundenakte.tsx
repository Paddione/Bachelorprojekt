import React, { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { Icons } from './Icons';
import { STATUS_LABEL } from '../lib/constants';
import type { Client, ProfileField, Session, Screen } from '../lib/types';

export function Kundenakte({ client, onNav }: { client: Client; onNav: (s: Screen) => void }) {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [profile, setProfile] = useState<ProfileField[]>([]);

  useEffect(() => {
    api.listSessions(client.id).then(setSessions).catch(() => setSessions([]));
    api.getProfile(client.id).then((r) => setProfile(r.fields)).catch(() => setProfile([]));
  }, [client.id]);

  const openSession = async (s: Session) => {
    onNav({ kind: 'workspace', session: s, client });
  };

  const copy = async (s: Session) => {
    const out = await api.copySessionAsTemplate(s.id);
    onNav({ kind: 'workspace', session: out.session, client });
  };

  return (
    <div className="screen">
      <div className="wrap">
        <button className="btn btn-quiet btn-sm" style={{ marginBottom: 14, paddingInline: 0 }} onClick={() => onNav({ kind: 'dashboard' })}>
          <Icons.back /> Übersicht
        </button>
        <div className="page-head" style={{ borderBottom: 'none', marginBottom: 8, paddingBottom: 0 }}>
          <div className="eyebrow">Kundenakte</div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '340px 1fr', gap: 28, alignItems: 'start' }}>
          <div className="stack" style={{ gap: 18 }}>
            <div className="card" style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div className="row">
                <span className="avatar" style={{ width: 54, height: 54, fontSize: 20 }}>{client.initials}</span>
                <div>
                  <div className="serif" style={{ fontSize: 24, letterSpacing: '-.01em' }}>{client.name}</div>
                  <div className="kicker" style={{ marginTop: 4 }}>Seit {client.since} · {client.lang}</div>
                </div>
              </div>
              <div className="stack" style={{ gap: 0 }}>
                <Row k="Kategorie" v={client.category} />
                <Row k="Sprache" v={client.lang} />
                <Row k="Format" v="Online · 60 Min" />
                <Row k="Sessions" v={`${sessions.length} gesamt`} />
              </div>
            </div>

            <div className="card" style={{ padding: 20 }}>
              <div className="between" style={{ marginBottom: 14 }}>
                <span className="kicker" style={{ fontSize: 10, color: 'var(--mute)' }}>KI-Profil · genau 1</span>
                <button className="btn btn-ghost btn-sm" onClick={() => onNav({ kind: 'profile', client })}>Bearbeiten</button>
              </div>
              <div className="stack" style={{ gap: 9 }}>
                {profile.map((f) => (
                  <div key={f.key} className="row" style={{ opacity: f.active ? 1 : 0.4, fontSize: 13, alignItems: 'baseline' }}>
                    <span className="kicker" style={{ minWidth: 100, fontSize: 9.5 }}>{f.label}</span>
                    <span style={{ flex: 1 }}>{f.active ? '✓ ' : ''}{f.value}</span>
                  </div>
                ))}
              </div>
              <div className="kicker" style={{ marginTop: 8 }}>{profile.filter((f) => f.active).length} von {profile.length} aktiv für Session</div>
            </div>
          </div>

          <div>
            <div className="between" style={{ marginBottom: 18 }}>
              <div className="row"><span className="serif" style={{ fontSize: 24, letterSpacing: '-.01em' }}>Sessions</span><span className="kicker">{sessions.length} Einträge</span></div>
              <button className="btn btn-primary btn-sm" onClick={() => onNav({ kind: 'workspace', session: undefined as any, client })}>
                <Icons.plus /> Neue Session
              </button>
            </div>
            <div className="stack" style={{ gap: 14 }}>
              {sessions.map((s) => (
                <div key={s.id} className="card" style={{ padding: '18px 20px', display: 'grid', gridTemplateColumns: '48px 1fr auto', gap: 18, alignItems: 'center' }}>
                  <div className="mono" style={{ fontSize: 12, color: 'var(--mute)' }}>{String(s.current_level ?? 0).padStart(2, '0')}</div>
                  <div>
                    <div className="serif" style={{ fontSize: 18, letterSpacing: '-.01em' }}>{s.title}</div>
                    <div className="kicker" style={{ marginTop: 3 }}>
                      <span className={`pill pill-${s.status}`} style={{ padding: '2px 0', border: 'none' }}>
                        <span className={`dot dot-${s.status}`} /> {STATUS_LABEL[s.status] ?? s.status}
                      </span>
                      {' · Ebene '}{s.current_level}/10 · {s.lang}
                    </div>
                  </div>
                  <div className="row" style={{ gap: 8 }}>
                    <button className="btn btn-primary btn-sm" onClick={() => openSession(s)}>{s.status === 'fertig' ? 'Ansehen' : 'Fortsetzen'} <Icons.arrow /></button>
                    <button className="btn btn-ghost btn-sm" onClick={() => copy(s)} title="Als Vorlage kopieren"><Icons.copy />Vorlage</button>
                    <button className="btn btn-ghost btn-sm" onClick={() => window.open(api.getSessionExportUrl(s.id), '_blank')} title="Exportieren"><Icons.printer />Export</button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="row" style={{ justifyContent: 'space-between', padding: '11px 0', borderTop: '1px solid var(--line)' }}>
      <span className="kicker" style={{ fontSize: 10 }}>{k}</span>
      <span style={{ textAlign: 'end' }}>{v}</span>
    </div>
  );
}
