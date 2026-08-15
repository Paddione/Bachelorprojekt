import { describe, it, expect, afterEach } from 'vitest';
import { compile } from 'svelte/compiler';
import { render } from 'svelte/server';
import { readFileSync, writeFileSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// Regression für den Live-Bug (PR #1624): ContactForm.svelte nutzte t(locale,…)/getTypes(locale)
// ohne Imports/locale-Prop → ReferenceError bei der Hydration → Kontaktformular-Felder erschienen
// nie (FA-10 T5/T6 Timeout). Hier wird die Komponente server-gerendert: vor dem Fix wirft der
// freie Identifier, nach dem Fix erscheinen die lokalisierten Labels.
const __dirname = dirname(fileURLToPath(import.meta.url));
const COMPILED = join(__dirname, '.ContactForm.compiled.svelte.mjs');

async function renderContactForm(props: Record<string, unknown>): Promise<string> {
  const source = readFileSync(join(__dirname, 'ContactForm.svelte'), 'utf8');
  const { js } = compile(source, { generate: 'server', runes: true, name: 'ContactForm' });
  writeFileSync(COMPILED, js.code);
  const mod = await import(/* @vite-ignore */ COMPILED);
  return render(mod.default, { props }).body;
}

afterEach(() => {
  try { rmSync(COMPILED, { force: true }); } catch { /* ignore */ }
});

describe('ContactForm i18n', () => {
  it('rendert ohne ReferenceError und zeigt die lokalisierten Felder (de)', async () => {
    const html = await renderContactForm({ locale: 'de' });
    expect(html).toContain('Name');
    expect(html).toContain('Ihre Nachricht');      // contact.message-label
    expect(html).toContain('Nachricht senden');     // contact.submit
    expect(html).toContain('Allgemeine Anfrage');   // typeOptions via i18n
  });

  it('lokalisiert die Labels auf en', async () => {
    const html = await renderContactForm({ locale: 'en' });
    expect(html).toContain('Your message');         // contact.message-label (en)
    expect(html).toContain('Send message');         // contact.submit (en)
    expect(html).toContain('General inquiry');      // contact.type-allgemein (en)
  });

  it('hat einen Default-Locale (de) wenn keine Prop gesetzt ist', async () => {
    const html = await renderContactForm({});
    expect(html).toContain('Nachricht senden');
  });
});
