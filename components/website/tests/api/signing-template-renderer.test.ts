import { describe, it, expect } from 'vitest';
import { renderTemplate, embedSignature } from '../../src/lib/signing/template-renderer';
import type { SignatureData } from '../../src/lib/signing/types';

describe('renderTemplate', () => {
  it('substitutes fixed variables', () => {
    const html = '<p>Kundennr: {{KUNDENNUMMER}}, Datum: {{DATUM}}</p>';
    const result = renderTemplate(html, { KUNDENNUMMER: 'K-001', DATUM: '09.06.2026' });
    expect(result).toBe('<p>Kundennr: K-001, Datum: 09.06.2026</p>');
  });

  it('renders editable fields as styled inputs', () => {
    const html = '<p>Name: {{EDIT:KUNDENNAME}}</p>';
    const result = renderTemplate(html, {}, { KUNDENNAME: 'Max Muster' });
    expect(result).toContain('<input');
    expect(result).toContain('name="KUNDENNAME"');
    expect(result).toContain('value="Max Muster"');
  });

  it('leaves unknown placeholders untouched', () => {
    const html = '<p>{{UNKNOWN}}</p>';
    const result = renderTemplate(html, {});
    expect(result).toBe('<p>{{UNKNOWN}}</p>');
  });
});

describe('embedSignature', () => {
  it('appends canvas signature block', () => {
    const sig: SignatureData = {
      type: 'canvas',
      imageData: 'data:image/png;base64,abc',
      signerName: 'Max Muster',
      ip: '127.0.0.1',
      userAgent: 'test',
      signedAt: '2026-06-09T14:00:00Z',
    };
    const result = embedSignature('<p>Doc</p>', sig);
    expect(result).toContain('data:image/png;base64,abc');
    expect(result).toContain('Max Muster');
  });

  it('appends checkbox confirmation block', () => {
    const sig: SignatureData = {
      type: 'checkbox',
      signerName: 'Anna Schmidt',
      ip: '10.0.0.1',
      userAgent: 'test',
      signedAt: '2026-06-09T15:00:00Z',
    };
    const result = embedSignature('<p>Doc</p>', sig);
    expect(result).toContain('Elektronisch bestätigt');
    expect(result).toContain('Anna Schmidt');
  });

  it('substitutes editable fields before embedding', () => {
    const sig: SignatureData = {
      type: 'checkbox',
      signerName: 'Test',
      ip: '127.0.0.1',
      userAgent: 'test',
      signedAt: '2026-06-09T15:00:00Z',
    };
    const result = embedSignature('Name: {{EDIT:KUNDENNAME}}', sig, { KUNDENNAME: 'Confirmed Name' });
    expect(result).toContain('Confirmed Name');
    expect(result).not.toContain('{{EDIT:KUNDENNAME}}');
  });
});
