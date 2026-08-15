import { describe, it, expect } from 'vitest';
import { schemaFor, validateSection } from './index';

describe('section schemas', () => {
  it('has a schema for every editable site_setting/legal/service key', () => {
    for (const k of ['kontakt', 'stammdaten', 'legal:datenschutz', 'service:coaching']) {
      expect(schemaFor(k), `missing schema for ${k}`).toBeTruthy();
    }
  });
  it('validateSection delegates to the field rules', () => {
    expect(validateSection('kontakt', { footerEmail: 'bad' }).some((e) => e.field === 'footerEmail')).toBe(true);
    expect(validateSection('kontakt', { footerEmail: 'a@b.de', footerPhone: '', footerCity: 'Lüneburg' })).toEqual([]);
  });
});
