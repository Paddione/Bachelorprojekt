import { describe, it, expect } from 'vitest';
import { buildFeatureList, parseSuggestions, SUGGEST_SYSTEM_PROMPT } from './suggest-prompt';
import type { PortfolioPayload } from './cockpit-types';

function portfolio(): PortfolioPayload {
  return {
    products: [
      {
        id: 'p1', extId: 'P1', title: 'Brett',
        rollup: { total: 10, done: 5, blocked: 1, inProgress: 2, awaitingDeploy: 0, open: 2, pctDone: 50 },
        features: [
          {
            id: 'f1', extId: 'T000111', title: 'Lobby-Refresh',
            valueProp: 'Schnellerer Lobby-Beitritt', priority: 'hoch', health: 'amber',
            rollup: { total: 4, done: 3, blocked: 0, inProgress: 1, awaitingDeploy: 0, open: 0, pctDone: 75 },
            nextStep: false, discarded: false, majorFeature: false,
            suggestionComment: 'fast fertig',
          },
          {
            id: 'f2', extId: 'T000222', title: 'Blocker-Feature',
            valueProp: undefined, priority: 'mittel', health: 'red',
            rollup: { total: 6, done: 0, blocked: 2, inProgress: 0, awaitingDeploy: 0, open: 4, pctDone: 0 },
            nextStep: false, discarded: false, majorFeature: true,
          },
        ],
      },
      {
        // synthetic aggregate bucket — must be filtered out
        id: 'ALL', extId: 'ALL', title: 'Alle Tickets',
        rollup: { total: 99, done: 0, blocked: 0, inProgress: 0, awaitingDeploy: 0, open: 99, pctDone: 0 },
        features: [
          {
            id: 'ALL', extId: 'ALL', title: 'Alle Tickets', priority: 'mittel', health: 'amber',
            rollup: { total: 99, done: 0, blocked: 0, inProgress: 0, awaitingDeploy: 0, open: 99, pctDone: 0 },
            nextStep: false, discarded: false, majorFeature: false, synthetic: true,
          },
        ],
      },
    ],
  };
}

describe('buildFeatureList', () => {
  const list = buildFeatureList(portfolio());

  it('includes the rich signals valueProp, health, pctDone, blocked, open', () => {
    expect(list).toContain('Schnellerer Lobby-Beitritt');
    expect(list).toContain('amber');
    expect(list).toContain('75'); // pctDone of f1
    expect(list).toContain('Blockiert: 2'); // blocked of f2
    expect(list).toMatch(/Offen: 4/); // open of f2
  });

  it('lists real features and excludes synthetic aggregate buckets', () => {
    expect(list).toContain('T000111');
    expect(list).toContain('T000222');
    expect(list).not.toContain('Alle Tickets');
  });
});

describe('SUGGEST_SYSTEM_PROMPT', () => {
  it('asks the model for the richer output schema and value/blocker reasoning', () => {
    expect(SUGGEST_SYSTEM_PROMPT).toMatch(/impact/);
    expect(SUGGEST_SYSTEM_PROMPT).toMatch(/value|Wert/i);
    expect(SUGGEST_SYSTEM_PROMPT).toMatch(/block/i);
  });
});

describe('parseSuggestions', () => {
  it('parses a valid JSON array with the rich fields', () => {
    const out = parseSuggestions(
      '[{"featureId":"T000111","nextStep":true,"reason":"fast fertig","impact":"hoch"}]',
    );
    expect(out).toHaveLength(1);
    expect(out[0]).toEqual({
      featureId: 'T000111', nextStep: true, reason: 'fast fertig', impact: 'hoch',
    });
  });

  it('extracts the array even when surrounded by prose', () => {
    const out = parseSuggestions('Hier mein Vorschlag:\n[{"featureId":"X","nextStep":false,"reason":"r"}]\nEnde.');
    expect(out).toHaveLength(1);
    expect(out[0].featureId).toBe('X');
  });

  it('tolerates a missing impact field', () => {
    const out = parseSuggestions('[{"featureId":"X","nextStep":true,"reason":"r"}]');
    expect(out[0].impact).toBeUndefined();
  });

  it('drops entries without a featureId', () => {
    const out = parseSuggestions('[{"nextStep":true,"reason":"r"},{"featureId":"Y","nextStep":false,"reason":"ok"}]');
    expect(out).toHaveLength(1);
    expect(out[0].featureId).toBe('Y');
  });

  it('ignores an impact value outside the enum', () => {
    const out = parseSuggestions('[{"featureId":"Z","nextStep":true,"reason":"r","impact":"BOOM"}]');
    expect(out[0].impact).toBeUndefined();
  });

  it('returns [] for non-array or garbage input', () => {
    expect(parseSuggestions('no json here')).toEqual([]);
    expect(parseSuggestions('{"featureId":"X"}')).toEqual([]);
    expect(parseSuggestions('')).toEqual([]);
  });
});
