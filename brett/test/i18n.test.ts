// brett/test/i18n.test.ts — E8 (T001931)
import { test } from 'node:test';
import assert from 'node:assert';
import de from '../src/client/locales/de';
import en from '../src/client/locales/en';
import fr from '../src/client/locales/fr';
import es from '../src/client/locales/es';

const DICTS: Record<string, Record<string, string>> = { de, en, fr, es };

test('alle vier Wörterbücher haben ein identisches Key-Set', () => {
  const deKeys = Object.keys(de).sort();
  assert.ok(deKeys.length > 40, 'de deckt die gescopte Oberfläche ab');
  for (const [lang, dict] of Object.entries(DICTS)) {
    assert.deepStrictEqual(Object.keys(dict).sort(), deKeys, `${lang} hat dasselbe Key-Set wie de`);
  }
});

test('keine leeren Übersetzungen', () => {
  for (const [lang, dict] of Object.entries(DICTS)) {
    for (const [k, v] of Object.entries(dict)) {
      assert.ok(typeof v === 'string' && v.trim().length > 0, `${lang}.${k} ist nicht leer`);
    }
  }
});

test('t() liefert den Wert der aktiven Sprache; Fallback auf de; sonst Key selbst', async () => {
  // Frische Modul-Instanz, damit setLang isoliert wirkt.
  const i18n = await import('../src/client/i18n');
  i18n.setLang('fr');
  assert.strictEqual(i18n.t('menu.create'), 'Créer une session', 'aktive Sprache fr');
  i18n.setLang('es');
  assert.strictEqual(i18n.t('fig.add'), 'Añadir figura', 'aktive Sprache es (mit Akzent)');
  // Key nur in de vorhanden → Fallback de unter aktiver fr.
  (de as Record<string, string>)['__only_de__'] = 'Nur Deutsch';
  i18n.setLang('fr');
  assert.strictEqual(i18n.t('__only_de__'), 'Nur Deutsch', 'Fallback auf de');
  delete (de as Record<string, string>)['__only_de__'];
  // Nirgends vorhanden → Key selbst.
  assert.strictEqual(i18n.t('does.not.exist'), 'does.not.exist', 'Key als Literal');
});

test('setLang ignoriert unbekannte Sprache', async () => {
  const i18n = await import('../src/client/i18n');
  i18n.setLang('de');
  i18n.setLang('xx' as any);
  assert.strictEqual(i18n.getLang(), 'de', 'unbekannte Sprache wird ignoriert');
});
