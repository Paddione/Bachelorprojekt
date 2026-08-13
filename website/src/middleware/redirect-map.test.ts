import { describe, it, expect } from 'vitest';
import { resolveRedirect, REDIRECT_MAP } from './redirect-map';

// Zeichengenaue SSOT-Tabelle — muss byte-fuer-byte der REDIRECT_MAP in redirect-map.ts entsprechen.
// ADR-006 Etappe 1 (T002624): die 12 SDLC-Seiten sind nach /sdlc/ umgezogen.
const CASES: ReadonlyArray<readonly [string, string]> = [
  ['/admin/cockpit',                  '/sdlc/cockpit'],
  ['/admin/observability',            '/sdlc/observability'],
  ['/admin/repohealth',               '/sdlc/repohealth'],
  ['/admin/software-history',         '/sdlc/software-history'],
  ['/admin/architektur',              '/sdlc/architektur'],
  ['/admin/platform',                 '/sdlc/platform'],
  ['/admin/app-catalog',              '/sdlc/app-catalog'],
  ['/admin/prompts',                  '/sdlc/prompts'],
  ['/admin/ki-konfiguration',         '/sdlc/ki-konfiguration'],
  ['/admin/systemtest/board',         '/sdlc/systemtest/board'],
  ['/admin/tickets',                  '/sdlc/cockpit'],
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
  ['/admin/planungsbuero',            '/sdlc/cockpit?tab=planung'],
  ['/admin/dora',                     '/sdlc/cockpit?tab=analytics'],
  ['/admin/factory-budget',           '/sdlc/cockpit?tab=kosten'],
  ['/admin/factory-observability',    '/sdlc/cockpit?tab=kosten'],
  ['/admin/ops',                      '/sdlc/platform'],
  ['/admin/monitoring',               '/sdlc/platform'],
  ['/admin/stream',                   '/admin/live'],
  ['/admin/newsletter',               '/admin/dokumente'],
  ['/admin/wissensquellen',           '/admin/wissen'],
];

describe('resolveRedirect', () => {
  it.each(CASES)('mappt %s -> %s', (from, to) => {
    expect(resolveRedirect(from)).toBe(to);
  });

  it('enthaelt genau 31 Eintraege und keine Zusatz-Keys', () => {
    expect(Object.keys(REDIRECT_MAP).sort()).toEqual(CASES.map(([p]) => p).sort());
  });

  it('leitet eine umgezogene SDLC-Seite weiter', () => {
    expect(resolveRedirect('/admin/cockpit')).toBe('/sdlc/cockpit');
    expect(resolveRedirect('/admin/tickets')).toBe('/sdlc/cockpit');
  });

  it('leitet eine Geschaeftsseite NICHT weiter', () => {
    expect(resolveRedirect('/admin/rechnungen')).toBeNull();
  });

  it('normalisiert einen einzelnen Trailing-Slash', () => {
    expect(resolveRedirect('/admin/dora/')).toBe('/sdlc/cockpit?tab=analytics');
  });

  it('gibt null fuer nicht-gemappte Pfade zurueck (dynamische Routen bleiben unberuehrt)', () => {
    expect(resolveRedirect('/admin/inhalte')).toBeNull();
    expect(resolveRedirect('/admin/bugs')).toBeNull();          // dynamisch, kein Literalziel
    expect(resolveRedirect('/admin/meetings/42')).toBeNull();   // dynamisch, kein Literalziel
  });
});
