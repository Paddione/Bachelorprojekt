// brett/src/client/i18n.ts — E8 leichtes eigenes i18n (DE/EN/FR/ES)
// Kein i18next: ~60 Strings in Vanilla-TS-UI. DE ist die Referenzsprache.
// Fallback-Kette: aktive Sprache → de → Key selbst. Sprachwahl:
// localStorage['brett_lang'] → navigator.language-Präfix → 'de'.
import de from './locales/de';
import en from './locales/en';
import fr from './locales/fr';
import es from './locales/es';

export type Lang = 'de' | 'en' | 'fr' | 'es';
type Dict = Record<string, string>;

const DICTS: Record<Lang, Dict> = { de, en, fr, es };
const FALLBACK: Lang = 'de';
const STORAGE_KEY = 'brett_lang';

let activeLang: Lang = FALLBACK;

export function getLang(): Lang {
  return activeLang;
}

export function setLang(lang: Lang): void {
  if (!DICTS[lang]) return;
  activeLang = lang;
  try { localStorage.setItem(STORAGE_KEY, lang); } catch { /* private mode */ }
  if (typeof document !== 'undefined' && document.documentElement) {
    document.documentElement.lang = lang;
  }
}

/** Übersetzt einen Key. Fallback: aktive Sprache → de → Key als Literal. */
export function t(key: string): string {
  const active = DICTS[activeLang];
  if (active && key in active) return active[key];
  const fb = DICTS[FALLBACK];
  if (fb && key in fb) return fb[key];
  return key;
}

/**
 * Wendet Übersetzungen auf alle `[data-i18n]`-Elemente unter `root` an
 * (Default: document). Zusätzlich werden `[data-i18n-placeholder]` und
 * `[data-i18n-title]` für Attribut-Übersetzungen unterstützt.
 */
export function applyTranslations(root?: ParentNode): void {
  const scope: ParentNode | undefined = root ?? (typeof document !== 'undefined' ? document : undefined);
  if (!scope || typeof (scope as any).querySelectorAll !== 'function') return;
  scope.querySelectorAll('[data-i18n]').forEach((el) => {
    const key = el.getAttribute('data-i18n');
    if (key) el.textContent = t(key);
  });
  scope.querySelectorAll('[data-i18n-placeholder]').forEach((el) => {
    const key = el.getAttribute('data-i18n-placeholder');
    if (key && 'placeholder' in el) (el as HTMLInputElement).placeholder = t(key);
  });
  scope.querySelectorAll('[data-i18n-title]').forEach((el) => {
    const key = el.getAttribute('data-i18n-title');
    if (key) (el as HTMLElement).title = t(key);
  });
}

/** Ermittelt die Startsprache und aktiviert sie. Idempotent. */
export function initLang(): Lang {
  let lang: Lang = FALLBACK;
  try {
    const stored = localStorage.getItem(STORAGE_KEY) as Lang | null;
    if (stored && DICTS[stored]) {
      lang = stored;
    } else {
      const nav = (typeof navigator !== 'undefined' ? navigator.language : '') || '';
      const prefix = nav.slice(0, 2).toLowerCase();
      if ((prefix in DICTS)) lang = prefix as Lang;
    }
  } catch { /* private mode / no navigator */ }
  setLang(lang);
  return lang;
}

export const LANGS: Lang[] = ['de', 'en', 'fr', 'es'];
