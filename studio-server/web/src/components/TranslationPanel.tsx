import React, { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { Icons } from './Icons';
import { TARGET_LANGS } from '../lib/constants';

const SOURCE_DE = 'Dies ist ein Platzhaltertext, der die Struktur der Übersetzungsansicht zeigt. Der eigentliche Inhalt wird zur Laufzeit erzeugt und parallel zur deutschen Fassung dargestellt.';

function speak(text: string, lang: string) {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
  try {
    const u = new SpeechSynthesisUtterance(text);
    u.lang = lang;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(u);
  } catch { /* noop */ }
}

export function TranslationPanel() {
  const [lang, setLang] = useState(TARGET_LANGS[0]);
  const [translated, setTranslated] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [playing, setPlaying] = useState<'de' | 't' | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api.llmTranslate({ text: SOURCE_DE, targetLang: lang.code })
      .then((r) => { if (!cancelled) setTranslated(r.translated); })
      .catch(() => { if (!cancelled) setTranslated(''); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [lang.code]);

  const play = (which: 'de' | 't') => {
    setPlaying(which);
    setTimeout(() => setPlaying(null), 1600);
    if (which === 'de') speak(SOURCE_DE, 'de-DE');
    else speak(translated, lang.code === 'fa' ? 'fa-IR' : lang.code === 'ar' ? 'ar-SA' : lang.code === 'tr' ? 'tr-TR' : lang.code === 'fr' ? 'fr-FR' : 'en-US');
  };

  return (
    <div className="aux-sec">
      <div className="block-head">
        <div className="bl">
          <Icons.globe style={{ color: 'var(--mute)' }} />
          <span className="bt">Übersetzung</span>
        </div>
      </div>
      <div className="tl-langs" role="tablist" aria-label="Zielsprache">
        {TARGET_LANGS.map((l) => (
          <button
            key={l.code}
            role="tab"
            aria-selected={l.code === lang.code}
            className={'tl-lang' + (l.code === lang.code ? ' is-active' : '')}
            onClick={() => setLang(l)}
            type="button"
          >
            {l.label}{l.rtl ? ' · rtl' : ''}
          </button>
        ))}
      </div>
      <div className="tl-pair">
        <div className="tl-col">
          <div className="tl-top">
            <span className="tl-lab">Deutsch · Original</span>
            <button className={'tts' + (playing === 'de' ? ' playing' : '')} onClick={() => play('de')} type="button">
              <Icons.speaker />{playing === 'de' ? 'Spricht…' : 'Vorlesen'}
            </button>
          </div>
          <div className="tl-text">{SOURCE_DE}</div>
        </div>
        <div className={'tl-col' + (lang.rtl ? ' rtl' : '')}>
          <div className="tl-top">
            <span className="tl-lab">{lang.label}{lang.rtl ? ' · RTL' : ''}</span>
            <button className={'tts' + (playing === 't' ? ' playing' : '')} onClick={() => play('t')} type="button">
              <Icons.speaker />{playing === 't' ? 'Spricht…' : 'Vorlesen'}
            </button>
          </div>
          <div className="tl-text" dir={lang.rtl ? 'rtl' : 'ltr'} lang={lang.code}>
            {loading ? 'Übersetze…' : (translated || '—')}
          </div>
        </div>
      </div>
    </div>
  );
}
