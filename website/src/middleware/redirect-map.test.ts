import { describe, it, expect } from 'vitest';
import { resolveRedirect, REDIRECT_MAP } from './redirect-map';

// Zeichengenaue SSOT-Tabelle — muss byte-fuer-byte der REDIRECT_MAP in redirect-map.ts entsprechen.
const CASES: ReadonlyArray<readonly [string, string]> = [
  ['/admin/startseite',               '/admin/inhalte?tab=website&section=startseite'],
  ['/admin/uebermich',                '/admin/inhalte?tab=website&section=uebermich'],
  ['/admin/referenzen',               '/admin/inhalte?tab=website&section=referenzen'],
  ['/admin/beratung',                 '/admin/inhalte?tab=website&section=beratung'],
  ['/admin/coaching',                 '/admin/inhalte?tab=website&section=coaching'],
  ['/admin/angebote',                 '/admin/inhalte?tab=website&section=angebote'],
  ['/admin/kontakt',                  '/admin/inhalte?tab=website&section=kontakt'],
  ['/admin/faq',                      '/admin/inhalte?tab=website&section=faq'],
  ['/admin/50plus-digital',           '/admin/inhalte?tab=website&section=50plus-digital'],
  ['/admin/fuehrung-persoenlichkeit', '/admin/inhalte?tab=website&section=fuehrung-persoenlichkeit'],
  ['/admin/ki-transition',            '/admin/inhalte?tab=website&section=ki-transition'],
  ['/admin/planungsbuero',            '/admin/pipeline?tab=planung'],
  ['/admin/dora',                     '/admin/pipeline?tab=analytics'],
  ['/admin/factory-budget',           '/admin/pipeline?tab=kosten'],
  ['/admin/factory-observability',    '/admin/pipeline?tab=kosten'],
  ['/admin/ops',                      '/admin/platform'],
  ['/admin/monitoring',               '/admin/platform'],
  ['/admin/tickets',                  '/admin/cockpit'],
  ['/admin/stream',                   '/admin/live'],
  ['/admin/newsletter',               '/admin/dokumente'],
  ['/admin/wissensquellen',           '/admin/wissen'],
];

describe('resolveRedirect', () => {
  it.each(CASES)('mappt %s -> %s', (from, to) => {
    expect(resolveRedirect(from)).toBe(to);
  });

  it('enthaelt genau 21 Eintraege und keine Zusatz-Keys', () => {
    expect(Object.keys(REDIRECT_MAP).sort()).toEqual(CASES.map(([p]) => p).sort());
  });

  it('normalisiert einen einzelnen Trailing-Slash', () => {
    expect(resolveRedirect('/admin/dora/')).toBe('/admin/pipeline?tab=analytics');
  });

  it('gibt null fuer nicht-gemappte Pfade zurueck (dynamische Routen bleiben unberuehrt)', () => {
    expect(resolveRedirect('/admin/inhalte')).toBeNull();
    expect(resolveRedirect('/admin/bugs')).toBeNull();          // dynamisch, kein Literalziel
    expect(resolveRedirect('/admin/meetings/42')).toBeNull();   // dynamisch, kein Literalziel
  });
});
