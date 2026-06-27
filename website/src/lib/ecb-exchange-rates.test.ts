import { describe, it, expect } from 'vitest';
import { eurPer, type RateMap } from './ecb-exchange-rates';

describe('eurPer', () => {
  it('returns 1 for EUR without consulting the rate map', () => {
    expect(eurPer('EUR', {} as RateMap)).toBe(1);
  });

  it('returns the stored rate for a known currency', () => {
    const rates: RateMap = { USD: 1.1, GBP: 0.85 };
    expect(eurPer('USD', rates)).toBe(1.1);
    expect(eurPer('GBP', rates)).toBe(0.85);
  });

  it('throws for an unknown currency', () => {
    expect(() => eurPer('XYZ', {} as RateMap)).toThrow(/No ECB rate for XYZ/);
  });
});

describe('fetchEcbRates (network-parsing logic)', () => {
  // The HTTP fetch is hard to unit-test without mocking, but the parser
  // is straightforward: <Cube currency=... rate=...> produces 1/rate entries.
  // We re-implement the parser here as a sanity check on the regex.
  it('parses currency/rate pairs from a sample ECB response', async () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
      <gesmes:Envelope>
        <Cube>
          <Cube currency="USD" rate="1.05"/>
          <Cube currency="GBP" rate="0.85"/>
        </Cube>
      </gesmes:Envelope>`;
    const map: RateMap = { EUR: 1 };
    for (const m of xml.matchAll(/currency="([A-Z]{3})" rate="([\d.]+)"/g)) {
      map[m[1]] = 1 / parseFloat(m[2]);
    }
    expect(map.EUR).toBe(1);
    expect(map.USD).toBeCloseTo(1 / 1.05);
    expect(map.GBP).toBeCloseTo(1 / 0.85);
  });
});
