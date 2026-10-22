import { describe, it, expect } from 'vitest';

import { renderTemplate, embedSignature } from './template-renderer';
import type { SignatureData } from './types';

function sig(over: Partial<SignatureData> = {}): SignatureData {
  return {
    type: 'checkbox',
    signerName: 'Max Mustermann',
    ip: '127.0.0.1',
    userAgent: '',
    signedAt: '2026-01-15T10:00:00.000Z',
    ...over,
  } as SignatureData;
}

describe('signing/template-renderer: XSS-Härtung (F3)', () => {
  it('embedSignature escapt Script-Tags in editableValues', () => {
    const out = embedSignature('<p>{{EDIT:X}}</p>', sig(), {
      X: '<script>fetch("http://intern/")</script>',
    });
    expect(out).not.toContain('<script>');
    expect(out).toContain('&lt;script&gt;');
  });

  it('embedSignature escapt signerName und IP', () => {
    const out = embedSignature('<p>ok</p>', sig({ signerName: '"><img src=x onerror=alert(1)>', ip: '<svg onload=alert(1)>' }));
    expect(out).not.toContain('<img src=x');
    expect(out).not.toContain('<svg');
    expect(out).toContain('&lt;svg');
  });

  it('embedSignature verwirft imageData ohne Bild-data-URL', () => {
    const out = embedSignature('<p>ok</p>', sig({ type: 'canvas', imageData: 'javascript:alert(1)' }));
    expect(out).not.toContain('javascript:alert(1)');
    expect(out).toContain('Elektronisch bestätigt');
  });

  it('embedSignature behält gueltige Bild-data-URLs', () => {
    const out = embedSignature(
      '<p>ok</p>',
      sig({ type: 'canvas', imageData: 'data:image/png;base64,iVBORw0KGgo=' }),
    );
    expect(out).toContain('<img src="data:image/png;base64,iVBORw0KGgo="');
  });

  it('renderTemplate escapt Anfuehrungszeichen und Tags im Default-Wert', () => {
    const out = renderTemplate('<p>{{EDIT:X}}</p>', {}, { X: '"><script>alert(1)</script>' });
    expect(out).not.toContain('<script>');
    expect(out).toContain('&quot;');
    expect(out).toContain('&lt;script&gt;');
  });
});
