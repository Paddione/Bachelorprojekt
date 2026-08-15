import { describe, it, expect } from 'vitest';
import { parseLeitstandQuery, toLeitstandQuery, type LeitstandSelection } from '../leitstand-url';

type Case = [string, string, Partial<LeitstandSelection>];

// Dieselben 14 Kontrakt-B-Faelle wie tests/spec/sdlc-cockpit/leitstand-url-scheme.bats
// (Vitest-Pflicht laut plan-quality-gates.md fuer jede neue lib-Datei).
const parseCases: Case[] = [
  ['neue Parameter werden durchgereicht', 'station=implement&ticket=T007957&deck=ki', { station: 'implement', ticket: 'T007957', deck: 'ki' }],
  ['legacy phase=triage → station=triage', 'phase=triage', { station: 'triage' }],
  ['legacy phase=planung → station=planung', 'phase=planung', { station: 'planung' }],
  ['legacy phase=deploy → station=deploy', 'phase=deploy', { station: 'deploy' }],
  ['legacy phase=ship → station=ship', 'phase=ship', { station: 'ship' }],
  ['legacy phase=bauen → keine Station', 'phase=bauen', {}],
  ['legacy phase=review → station=verify', 'phase=review', { station: 'verify' }],
  ['legacy mode=insights → deck=ki', 'mode=insights', { deck: 'ki' }],
  ['legacy mode=overview → leer', 'mode=overview', {}],
  ['unbekannte Station wird ignoriert', 'station=doesnotexist', {}],
  ['unbekanntes Deck wird ignoriert', 'deck=doesnotexist', {}],
  ['unbekanntes phase wirft nie', 'phase=doesnotexist', {}],
  ['unbekanntes mode wirft nie', 'mode=doesnotexist', {}],
  ['neu gewinnt vor legacy', 'station=verify&phase=triage', { station: 'verify' }],
];

describe('parseLeitstandQuery', () => {
  it.each(parseCases)('%s', (_name, qs, expected) => {
    expect(parseLeitstandQuery(new URLSearchParams(qs))).toEqual(expected);
  });
});

describe('toLeitstandQuery', () => {
  it('Feld-Reihenfolge station,ticket,deck, kein fuehrendes ?', () => {
    expect(toLeitstandQuery({ station: 'implement', ticket: 'T007957', deck: 'ki' })).toBe(
      'station=implement&ticket=T007957&deck=ki',
    );
  });

  it('leere Felder werden ausgelassen', () => {
    expect(toLeitstandQuery({ station: 'implement', ticket: 'T007957' })).toBe(
      'station=implement&ticket=T007957',
    );
  });

  it('leere Selektion → leerer String', () => {
    expect(toLeitstandQuery({})).toBe('');
  });
});

describe('round-trip', () => {
  it('parse(toLeitstandQuery(sel)) ergibt wieder sel', () => {
    const sel: LeitstandSelection = { station: 'verify', ticket: 'T007957', deck: 'plattform' };
    expect(parseLeitstandQuery(new URLSearchParams(toLeitstandQuery(sel)))).toEqual(sel);
  });
});
