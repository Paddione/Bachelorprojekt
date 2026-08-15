import { describe, it, expect } from 'vitest';
import { leitstandPurposes } from '../leitstand-purpose-registry';

describe('leitstandPurposes', () => {
  it('ist nicht leer', () => {
    expect(Object.keys(leitstandPurposes).length).toBeGreaterThan(0);
  });

  it('jeder Eintrag hat zweck/datenquelle/aktionen (aktionen: Array, auch leer erlaubt)', () => {
    for (const entry of Object.values(leitstandPurposes)) {
      expect(typeof entry.zweck).toBe('string');
      expect(entry.zweck.length).toBeGreaterThan(0);
      expect(typeof entry.datenquelle).toBe('string');
      expect(entry.datenquelle.length).toBeGreaterThan(0);
      expect(Array.isArray(entry.aktionen)).toBe(true);
    }
  });

  it('zweck ist global einzigartig', () => {
    const zwecke = Object.values(leitstandPurposes).map((v) => v.zweck);
    expect(new Set(zwecke).size).toBe(zwecke.length);
  });

  it('enthaelt die in design.md genannten Kern-Keys', () => {
    for (const key of ['statusband', 'kontextzone', 'deck-qualitaet', 'deck-plattform', 'deck-ki', 'deck-wissen']) {
      expect(key in leitstandPurposes).toBe(true);
    }
  });
});
