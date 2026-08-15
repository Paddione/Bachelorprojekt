import React, { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { Icons } from './Icons';
import type { Client, Level, Session, StandardLevel, Screen } from '../lib/types';

export function CompareView({ session, client, onNav }: { session: Session; client: Client; onNav: (s: Screen) => void }) {
  const [standards, setStandards] = useState<StandardLevel[]>([]);
  const [current, setCurrent] = useState<Level[]>([]);
  const [template, setTemplate] = useState<Level[]>([]);
  const [templateSession, setTemplateSession] = useState<Session | null>(null);

  useEffect(() => {
    api.getStandardLevels().then(setStandards).catch(() => setStandards([]));
    api.getSession(session.id).then((out) => setCurrent(out.levels)).catch(() => setCurrent([]));
    if (session.template_of) {
      api.getSession(session.template_of).then((out) => {
        setTemplate(out.levels);
        setTemplateSession(out.session);
      }).catch(() => setTemplate([]));
    }
  }, [session.id, session.template_of]);

  const diffs = new Set<number>();
  template.forEach((tl, i) => {
    if (current[i] && (tl.answer ?? '') !== (current[i].answer ?? '')) diffs.add(i);
  });

  return (
    <div className="screen">
      <div className="wrap">
        <button className="btn btn-quiet btn-sm" style={{ marginBottom: 14, paddingInline: 0 }} onClick={() => onNav({ kind: 'workspace', session, client })}><Icons.back />Zurück zur Session</button>
        <div className="page-head">
          <div className="eyebrow">Vergleich · Alt vs. Neu</div>
          <div className="between" style={{ alignItems: 'flex-end' }}>
            <h1>Vorlage gegen <em>neue Session</em></h1>
            <div className="row" style={{ gap: 8 }}>
              <span className="pill"><span className="dot dot-fertig" />{diffs.size} Abweichungen</span>
              <button className="btn btn-ghost btn-sm" onClick={() => window.open(api.getSessionExportUrl(session.id), '_blank')}><Icons.printer />Export</button>
            </div>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 0, border: '1px solid var(--line)', borderRadius: 12, overflow: 'hidden' }}>
          <div className="cmp-col alt">
            <div className="cmp-head">
              <span className="badge">Vorlage · Alt</span>
              <span className="kicker">{templateSession ? `Session ${String(templateSession.current_level).padStart(2, '0')} · ${templateSession.status}` : '—'}</span>
            </div>
            {standards.map((l, i) => {
              const tl = template[i];
              return (
                <div key={l.level_no} className={'cmp-lvl' + (diffs.has(i) ? ' diff' : '')}>
                  <div className="ch">{l.no} — {l.name}</div>
                  <div className="cp">{tl?.answer ?? '—'}</div>
                </div>
              );
            })}
          </div>
          <div className="cmp-col neu">
            <div className="cmp-head">
              <span className="badge">Neue Session</span>
              <span className="kicker">{client.name} · in Arbeit</span>
            </div>
            {standards.map((l, i) => {
              const cl = current[i];
              return (
                <div key={l.level_no} className={'cmp-lvl' + (diffs.has(i) ? ' diff' : '')}>
                  <div className="ch">{l.no} — {l.name} {diffs.has(i) && <span style={{ color: 'var(--brass)' }}>· geändert</span>}</div>
                  <div className="cp">{cl?.answer ?? '—'}</div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
