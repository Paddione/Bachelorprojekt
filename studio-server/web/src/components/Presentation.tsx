import React, { useEffect, useState } from 'react';
import { BrandMark } from './Icons';
import type { Level, Session, StandardLevel } from '../lib/types';
import { api } from '../lib/api';

const TARGET_LANGS: Array<{ code: string; name: string; rtl: boolean }> = [
  { code: 'fa', name: 'فارسی', rtl: true },
  { code: 'ar', name: 'العربية', rtl: true },
  { code: 'tr', name: 'Türkçe', rtl: false },
];

export function Presentation({ sessionId }: { sessionId: string }) {
  const [session, setSession] = useState<Session | null>(null);
  const [levels, setLevels] = useState<Level[]>([]);
  const [standards, setStandards] = useState<StandardLevel[]>([]);
  const [i, setI] = useState(0);
  const [lang, setLang] = useState('fa');

  useEffect(() => {
    api.getSession(sessionId).then((out) => { setSession(out.session); setLevels(out.levels); }).catch(() => {});
    api.getStandardLevels().then(setStandards).catch(() => setStandards([]));
  }, [sessionId]);

  useEffect(() => {
    document.documentElement.dir = lang === 'fa' || lang === 'ar' ? 'rtl' : 'ltr';
  }, [lang]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') setI((n) => Math.min(9, n + 1));
      if (e.key === 'ArrowLeft') setI((n) => Math.max(0, n - 1));
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  const speak = (text: string, l: string) => {
    if (!('speechSynthesis' in window)) return;
    const u = new SpeechSynthesisUtterance(text);
    u.lang = l === 'fa' ? 'fa-IR' : l === 'ar' ? 'ar-SA' : 'tr-TR';
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(u);
  };

  const lvl = standards[i];
  const levelData = levels[i];

  return (
    <div style={{ position: 'relative', zIndex: 2, height: '100vh', display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '26px 48px' }}>
        <div className="row">
          <BrandMark size={30} />
          <span className="serif" style={{ fontSize: 22 }}>mentolder<span style={{ color: 'var(--brass)' }}>.</span></span>
        </div>
        <div style={{ fontFamily: 'var(--mono)', fontSize: 13, letterSpacing: '.18em', textTransform: 'uppercase', color: 'var(--brass)' }}>
          Ebene {lvl?.no ?? '—'} — {lvl?.name ?? '—'}
        </div>
      </div>

      <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '1fr 1fr', minHeight: 0 }}>
        <div style={{ padding: '24px 56px', overflowY: 'auto', display: 'flex', flexDirection: 'column', justifyContent: 'center', borderInlineEnd: '1px solid var(--line)' }}>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 13, letterSpacing: '.16em', textTransform: 'uppercase', color: 'var(--mute)', marginBottom: 30, display: 'flex', alignItems: 'center', gap: 14 }}>
            Deutsch
            <button className="tts" onClick={() => speak(`Ebene ${lvl?.no}: ${lvl?.name}`, 'de-DE')} type="button">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16"><path d="M4 9v6h4l5 4V5L8 9H4zM17 8a5 5 0 0 1 0 8" /></svg>
              Vorlesen
            </button>
          </div>
          <div style={{ marginBottom: 40 }}>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 12, letterSpacing: '.14em', textTransform: 'uppercase', color: 'var(--mute)', marginBottom: 12 }}>Eingabe</div>
            <div style={{ fontFamily: 'var(--serif)', fontWeight: 300, fontSize: 30, lineHeight: 1.4, color: 'var(--fg)' }}>
              {session ? `Beitrag zu „${lvl?.name ?? '—'}".` : '—'}
            </div>
          </div>
          <div>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 12, letterSpacing: '.14em', textTransform: 'uppercase', color: 'var(--brass)', marginBottom: 12 }}>Antwort</div>
            <div style={{ fontFamily: 'var(--sans)', fontWeight: 300, fontSize: 26, lineHeight: 1.55, color: 'var(--fg-soft)' }}>
              {levelData?.answer ?? 'Noch keine Antwort für diese Ebene.'}
            </div>
          </div>
        </div>

        <div className={lang === 'fa' || lang === 'ar' ? 'rtl' : ''} lang={lang} style={{ padding: '24px 56px', overflowY: 'auto', display: 'flex', flexDirection: 'column', justifyContent: 'center', direction: lang === 'fa' || lang === 'ar' ? 'rtl' : 'ltr' }}>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 13, letterSpacing: '.16em', textTransform: 'uppercase', color: 'var(--mute)', marginBottom: 30, display: 'flex', alignItems: 'center', gap: 14 }}>
            {TARGET_LANGS.find((l) => l.code === lang)?.name ?? '—'}
            <button className="tts" onClick={() => speak(lvl?.name ?? '', lang === 'fa' ? 'fa-IR' : lang === 'ar' ? 'ar-SA' : 'tr-TR')} type="button">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16"><path d="M4 9v6h4l5 4V5L8 9H4zM17 8a5 5 0 0 1 0 8" /></svg>
              خواندن
            </button>
          </div>
          <div style={{ fontFamily: 'var(--serif)', fontWeight: 300, fontSize: lang === 'fa' || lang === 'ar' ? 32 : 26, lineHeight: 1.75, color: 'var(--fg-soft)' }}>
            {lvl?.goal ?? '—'}
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '22px 48px', borderTop: '1px solid var(--line)' }}>
        <button className="btn btn-ghost" onClick={() => setI(Math.max(0, i - 1))} disabled={i === 0} type="button">← Zurück</button>
        <div className="row" style={{ gap: 8 }}>
          {standards.map((_, n) => (
            <span key={n} style={{ width: n === i ? 26 : 9, height: 9, borderRadius: 999, background: n === i ? 'var(--brass)' : 'var(--line-2)', display: 'block' }} />
          ))}
        </div>
        <div className="row" style={{ gap: 8 }}>
          {TARGET_LANGS.map((l) => (
            <button
              key={l.code}
              onClick={() => setLang(l.code)}
              className="btn btn-sm"
              style={{
                background: lang === l.code ? 'var(--brass-d)' : 'transparent',
                color: lang === l.code ? 'var(--brass)' : 'var(--fg-soft)',
                border: '1px solid ' + (lang === l.code ? 'var(--brass)' : 'var(--line-2)'),
                borderRadius: 999, padding: '0 16px', minHeight: 44,
              }}
              type="button"
            >
              {l.name}
            </button>
          ))}
          <button className="btn btn-primary" onClick={() => setI(Math.min(9, i + 1))} disabled={i === 9} type="button">Weiter →</button>
        </div>
      </div>
    </div>
  );
}
