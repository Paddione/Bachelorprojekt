import { describe, it, expect } from 'vitest';
import { buildUstvaXml } from './elster-xml';

describe('buildUstvaXml', () => {
  it('emits an Elster UStVA XML for the given year and period', () => {
    const xml = buildUstvaXml(
      { kz81: 1000, kz86: 500, kz41: 0, kz43: 0, kz66: 81.5 },
      { year: 2026, period: 6, brand: 'mentolder' },
    );
    expect(xml).toContain('<?xml');
    expect(xml).toContain('http://www.elster.de/elsterxml/schema/v11');
    expect(xml).toContain('<Jahr>2026</Jahr>');
    expect(xml).toContain('<Zeitraum>06</Zeitraum>');
  });

  it('computes Kz81_Steuer as 19% of Kz81 and rounds to two decimals', () => {
    const xml = buildUstvaXml(
      { kz81: 1000, kz86: 0, kz41: 0, kz43: 0, kz66: 0 },
      { year: 2026, period: 1, brand: 'mentolder' },
    );
    expect(xml).toContain('<Kz81>1000,00</Kz81>');
    expect(xml).toContain('<Kz81_Steuer>190,00</Kz81_Steuer>');
  });

  it('computes Kz86_Steuer as 7% of Kz86 and rounds to two decimals', () => {
    const xml = buildUstvaXml(
      { kz81: 0, kz86: 200, kz41: 0, kz43: 0, kz66: 0 },
      { year: 2026, period: 1, brand: 'mentolder' },
    );
    expect(xml).toContain('<Kz86>200,00</Kz86>');
    expect(xml).toContain('<Kz86_Steuer>14,00</Kz86_Steuer>');
  });

  it('zero-pads single-digit periods (months 1-9) to two digits', () => {
    const xml = buildUstvaXml(
      { kz81: 0, kz86: 0, kz41: 0, kz43: 0, kz66: 0 },
      { year: 2026, period: 9, brand: 'mentolder' },
    );
    expect(xml).toContain('<Zeitraum>09</Zeitraum>');
  });

  it('formats German decimal commas (not English dots)', () => {
    const xml = buildUstvaXml(
      { kz81: 1234.56, kz86: 0, kz41: 0, kz43: 0, kz66: 0 },
      { year: 2026, period: 12, brand: 'mentolder' },
    );
    expect(xml).toContain('<Kz81>1234,56</Kz81>');
  });

  it('emits the kz41, kz43, kz66 fields verbatim', () => {
    const xml = buildUstvaXml(
      { kz81: 0, kz86: 0, kz41: 200, kz43: 100, kz66: 50 },
      { year: 2026, period: 12, brand: 'mentolder' },
    );
    expect(xml).toContain('<Kz41>200,00</Kz41>');
    expect(xml).toContain('<Kz43>100,00</Kz43>');
    expect(xml).toContain('<Kz66>50,00</Kz66>');
  });
});
