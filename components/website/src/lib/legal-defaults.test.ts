import { describe, it, expect } from 'vitest';
import {
  getDefaultDatenschutz,
  getDefaultAgb,
  getDefaultBarrierefreiheit,
  getDefaultImpressum,
  getDefaultImpressumZusatz,
} from './legal-defaults';

describe('getDefaultDatenschutz', () => {
  it('returns an HTML datenschutz page with DSGVO reference', () => {
    const html = getDefaultDatenschutz();
    expect(html).toContain('<h1>Datenschutzerklärung</h1>');
    expect(html).toContain('DSGVO');
    expect(html).toContain('stammdaten');
  });

  it('mentions the on-premises / Hetzner hosting clause', () => {
    const html = getDefaultDatenschutz();
    expect(html).toContain('Hetzner');
    expect(html).toContain('On-Premises');
  });
});

describe('getDefaultAgb', () => {
  it('returns an HTML AGB page with §19 UStG and 14-day payment terms', () => {
    const html = getDefaultAgb();
    expect(html).toContain('<h1>Allgemeine Geschäftsbedingungen</h1>');
    expect(html).toContain('§ 19 UStG');
    expect(html).toContain('14 Tagen');
  });
});

describe('getDefaultBarrierefreiheit', () => {
  it('returns the BITV accessibility statement', () => {
    const html = getDefaultBarrierefreiheit();
    expect(html).toContain('<h1>Erklärung zur Barrierefreiheit</h1>');
    expect(html).toContain('barrierefrei');
  });
});

describe('getDefaultImpressum', () => {
  it('returns a minimal Impressum with stammdaten tokens', () => {
    const html = getDefaultImpressum();
    expect(html).toContain('<h1>Impressum</h1>');
    expect(html).toContain('stammdaten.name');
    expect(html).toContain('stammdaten.email');
  });
});

describe('getDefaultImpressumZusatz', () => {
  it('returns an empty string (no additional impressum content by default)', () => {
    expect(getDefaultImpressumZusatz()).toBe('');
  });
});
