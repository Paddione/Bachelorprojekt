import React, { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { Icons } from './Icons';
import type { Client, Session, Screen } from '../lib/types';

export function Dashboard({ onNav }: { onNav: (s: Screen) => void }) {
  const [clients, setClients] = useState<Client[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [q, setQ] = useState('');
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([api.listClients().catch(() => []), api.listSessions().catch(() => [])])
      .then(([c, s]) => { setClients(c); setSessions(s); })
      .catch((e) => setErr(String(e)));
  }, []);

  const filter = clients.filter((k) =>
    k.name.toLowerCase().includes(q.toLowerCase()) || k.category.toLowerCase().includes(q.toLowerCase())
  );

  const sum = sessions.reduce((a, s) => {
    a[s.status] = (a[s.status] ?? 0) + 1; return a;
  }, {} as Record<string, number>);

  const newSession = async (c: Client) => {
    const title = `Neue Session · ${c.name}`;
    const out = await api.createSession({ clientId: c.id, title, lang: c.lang });
    onNav({ kind: 'workspace', session: out.session, client: c });
  };

  return (
    <div className="screen">
      <div className="wrap">
        <div className="page-head">
          <div className="eyebrow">Übersicht</div>
          <div className="between" style={{ alignItems: 'flex-end' }}>
            <h1>Klient:innen &amp; <em>Sessions</em></h1>
          </div>
        </div>

        <div className="stat-strip">
          <div className="stat-cell"><div className="n">{clients.length}</div><div className="l">Klient:innen</div></div>
          <div className="stat-cell"><div className="n">{sum.aktiv ?? 0}<em> ●</em></div><div className="l">Aktive Sessions</div></div>
          <div className="stat-cell"><div className="n">{sum.pausiert ?? 0}</div><div className="l">Pausiert</div></div>
          <div className="stat-cell"><div className="n">{sum.fertig ?? 0}</div><div className="l">Abgeschlossen</div></div>
        </div>

        <div className="row" style={{ marginBottom: 26, flexWrap: 'wrap' }}>
          <div className="search" style={{ position: 'relative', flex: 1, minWidth: 240 }}>
            <Icons.search style={{ position: 'absolute', insetInlineStart: 14, top: '50%', transform: 'translateY(-50%)', width: 16, height: 16, color: 'var(--mute)' }} />
            <input
              className="input"
              style={{ paddingInlineStart: 40 }}
              placeholder="Suche nach Name oder Kategorie…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              aria-label="Klient:innen suchen"
            />
          </div>
          <button className="btn btn-ghost" onClick={() => onNav({ kind: 'admin' })}>Admin</button>
        </div>

        {err && <p style={{ color: 'var(--danger)' }}>{err}</p>}

        <div className="kunden-grid">
          {filter.map((k) => {
            const ksum = sessions.filter((s) => s.client_id === k.id).reduce((a, s) => { a[s.status] = (a[s.status] ?? 0) + 1; return a; }, {} as Record<string, number>);
            return (
              <button key={k.id} className="card kunde-card" onClick={() => onNav({ kind: 'akte', client: k })}>
                <div className="row">
                  <span className="avatar">{k.initials}</span>
                  <div>
                    <div className="serif" style={{ fontSize: 20, letterSpacing: '-.01em' }}>{k.name}</div>
                    <div className="kicker" style={{ marginTop: 2 }}>{k.category} · {k.lang} · seit {k.since}</div>
                  </div>
                </div>
                <div className="row" style={{ gap: 16, justifyContent: 'space-between' }}>
                  <div className="stack"><div className="serif" style={{ fontSize: 22 }}>{ksum.aktiv ?? 0}</div><div className="kicker">Aktiv</div></div>
                  <div className="stack"><div className="serif" style={{ fontSize: 22 }}>{ksum.pausiert ?? 0}</div><div className="kicker">Pausiert</div></div>
                  <div className="stack"><div className="serif" style={{ fontSize: 22 }}>{ksum.fertig ?? 0}</div><div className="kicker">Fertig</div></div>
                </div>
                <div className="row" style={{ gap: 8, paddingTop: 14, borderTop: '1px solid var(--line)' }}>
                  <span className={`pill pill-${(ksum.aktiv ?? 0) > 0 ? 'aktiv' : (ksum.pausiert ?? 0) > 0 ? 'pausiert' : 'fertig'}`}>
                    <span className={`dot dot-${(ksum.aktiv ?? 0) > 0 ? 'aktiv' : (ksum.pausiert ?? 0) > 0 ? 'pausiert' : 'fertig'}`} />
                    {(ksum.aktiv ?? 0) > 0 ? 'Aktiv' : (ksum.pausiert ?? 0) > 0 ? 'Pausiert' : 'Ruht'}
                  </span>
                </div>
                <button
                  className="btn btn-primary btn-sm"
                  onClick={(e) => { e.stopPropagation(); newSession(k); }}
                >
                  <Icons.plus /> Neue Session
                </button>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
