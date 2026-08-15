import type { TargetLang } from './types';

export const TARGET_LANGS: TargetLang[] = [
  { code: 'fa', label: 'Farsi', rtl: true },
  { code: 'ar', label: 'Arabisch', rtl: true },
  { code: 'tr', label: 'Türkisch', rtl: false },
  { code: 'en', label: 'EN', rtl: false },
  { code: 'fr', label: 'FR', rtl: false },
];

export const HIGHLIGHT_LEVELS: number[] = [5, 9];

export const STATUS_LABEL: Record<string, string> = {
  aktiv: 'Aktiv',
  pausiert: 'Pausiert',
  fertig: 'Abgeschlossen',
};
