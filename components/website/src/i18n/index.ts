import de from './de';
import en from './en';

export type Locale = 'de' | 'en';
export const locales: Locale[] = ['de', 'en'];
export const defaultLocale: Locale = 'de';

const dictionaries = { de, en } as const;

export function getDictionary(locale: Locale): Record<string, string> {
  return dictionaries[locale] ?? dictionaries.de;
}

export function t(locale: Locale, key: string): string {
  const dict = getDictionary(locale);
  return (dict as Record<string, string>)[key] ?? key;
}

export function getLocaleFromUrl(url: URL): Locale {
  const segments = url.pathname.split('/').filter(Boolean);
  if (segments[0] === 'en') return 'en';
  return 'de';
}

export function getLocaleFromCookie(cookieHeader: string | undefined): Locale | null {
  if (!cookieHeader) return null;
  const match = cookieHeader.match(/locale=(de|en)/);
  return match ? (match[1] as Locale) : null;
}
