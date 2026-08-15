import { describe, it, expect } from 'vitest';
import {
  MOCK_PREVIEW_VARS,
  substituteTemplatePlaceholders,
  buildCustomerVars,
} from '../../src/lib/signing/preview-vars';

describe('substituteTemplatePlaceholders', () => {
  it('replaces fixed and EDIT placeholders with mock values', () => {
    const html =
      '<p>{{KUNDENNAME}} ({{KUNDENNUMMER}}) — {{EDIT:FIRMA}}</p>';
    const out = substituteTemplatePlaceholders(html, MOCK_PREVIEW_VARS);
    expect(out).toContain('Max Mustermann');
    expect(out).toContain('K-001');
    expect(out).toContain('Muster GmbH');
    expect(out).not.toContain('{{');
    expect(out).not.toContain('<input');
  });

  it('fills DATUM and JAHR with current date/year', () => {
    const year = String(new Date().getFullYear());
    const out = substituteTemplatePlaceholders('<p>{{JAHR}}</p>', MOCK_PREVIEW_VARS);
    expect(out).toContain(year);
  });

  it('leaves unknown placeholders untouched', () => {
    const out = substituteTemplatePlaceholders('<p>{{UNKNOWN}}</p>', MOCK_PREVIEW_VARS);
    expect(out).toBe('<p>{{UNKNOWN}}</p>');
  });
});

describe('buildCustomerVars', () => {
  it('maps customer fields to template variable keys', () => {
    const vars = buildCustomerVars({
      name: 'Erika Beispiel',
      email: 'erika@beispiel.de',
      phone: '+49 30 111',
      company: 'Beispiel AG',
      customer_number: 'K-042',
    });
    expect(vars.KUNDENNAME).toBe('Erika Beispiel');
    expect(vars.EMAIL).toBe('erika@beispiel.de');
    expect(vars.TELEFON).toBe('+49 30 111');
    expect(vars.FIRMA).toBe('Beispiel AG');
    expect(vars.KUNDENNUMMER).toBe('K-042');
    expect(vars.VORNAME).toBe('Erika');
    expect(vars.NACHNAME).toBe('Beispiel');
  });

  it('falls back to empty strings for missing optional fields', () => {
    const vars = buildCustomerVars({ name: 'Mononym', email: 'm@x.de' });
    expect(vars.TELEFON).toBe('');
    expect(vars.FIRMA).toBe('');
    expect(vars.NACHNAME).toBe('');
    expect(vars.VORNAME).toBe('Mononym');
  });
});
