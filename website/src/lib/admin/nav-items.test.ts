// Guard gegen die Fehlerklasse aus T003826: ein Sidebar-Eintrag, dessen Pfad über
// REDIRECT_MAP in einer /sdlc/-Route landet, ist im Produktions-Build unerreichbar —
// build-target.mjs filtert alle /sdlc/-Routen aus dem Manifest (BUILD_TARGET=prod).
//
// PRÜFMODUS: Output-Verifikation. Der Test importiert die Nav-Definition und die reale
// Auflösungsfunktion und misst das ERGEBNIS der Auflösung. Er greppt bewusst NICHT den
// Quelltext der Astro-Komponente — genau diese Prüfform (Source-Grep, CLAUDE.md
// § Test-Resultats-Konvention T002448-M4) hatte den Defekt durchrutschen lassen.
import { describe, it, expect } from 'vitest';
import { buildNavSections, type NavItem, type NavSection } from './nav-items';
import { resolveRedirect } from '../../middleware/redirect-map';

const OPTS = { inboxPending: 3, brettUrl: 'https://brett.example.invalid' };

/** Folgt der Redirect-Kette bis zum Endziel. Ein Eintrag kann über mehrere Sprünge
 *  in /sdlc/ landen; eine einstufige Prüfung würde das übersehen. */
function resolveFinal(href: string): string {
  let current = href;
  for (let hop = 0; hop < 10; hop++) {
    const next = resolveRedirect(current.split('?')[0]);
    if (next === null || next === current) return current;
    current = next;
  }
  return current;
}

function isSdlcTarget(href: string): boolean {
  return resolveFinal(href).startsWith('/sdlc/');
}

function allItems(sections: NavSection[]): NavItem[] {
  return sections.flatMap((s) => s.items);
}

function internalItems(sections: NavSection[]): NavItem[] {
  return allItems(sections).filter((i) => !i.external);
}

describe('Admin-Sidebar — keine Einträge auf im prod-Build entfernte Routen', () => {
  it('kein href löst auf eine /sdlc/-Route auf', () => {
    const offenders = internalItems(buildNavSections(OPTS))
      .filter((i) => isSdlcTarget(i.href))
      .map((i) => `${i.label} → ${i.href} → ${resolveFinal(i.href)}`);

    // Positiv-Anker (CLAUDE.md § Positiv-Anker-Pflicht, T002356-M1): ohne ihn bestünde
    // die Zusicherung auch bei leerer Kandidatenliste vakuos.
    expect(internalItems(buildNavSections(OPTS)).length).toBeGreaterThan(0);
    expect(offenders).toEqual([]);
  });

  it('auch die matches-Pfade zeigen nicht in /sdlc/', () => {
    const offenders = allItems(buildNavSections(OPTS))
      .flatMap((i) => (i.matches ?? []).map((m) => ({ label: i.label, match: m })))
      .filter(({ match }) => isSdlcTarget(match))
      .map(({ label, match }) => `${label} → matches ${match}`);

    expect(offenders).toEqual([]);
  });

  it('erkennt einen eingeschleusten SDLC-Eintrag als Verstoß', () => {
    // Beweist, dass der Guard überhaupt anschlägt — sonst wäre grün nicht aussagekräftig.
    expect(isSdlcTarget('/admin/cockpit')).toBe(true);
    expect(isSdlcTarget('/admin/planungsbuero')).toBe(true); // transitiv über ?tab=planung
    expect(isSdlcTarget('/admin/inhalte')).toBe(false);
  });
});

describe('Admin-Sidebar — Gliederung', () => {
  it('führt die vier benannten Sektionen und keine Werkstatt mehr', () => {
    const labels = buildNavSections(OPTS)
      .map((s) => s.label)
      .filter((l): l is string => Boolean(l));

    expect(labels).toEqual(['Geschäft', 'Inhalte', 'Werkzeuge', 'System']);
    expect(labels).not.toContain('Werkstatt');
    expect(labels).not.toContain('Infrastruktur');
  });

  it('enthält genau die zwölf freigegebenen Einträge', () => {
    const hrefs = allItems(buildNavSections(OPTS)).map((i) => i.href);

    expect(hrefs).toHaveLength(12);
    for (const gone of [
      '/admin/cockpit',
      '/admin/app-catalog',
      '/admin/ki-konfiguration',
      '/admin/prompts',
      '/admin/systemtest/board',
      '/admin/repohealth',
    ]) {
      expect(hrefs).not.toContain(gone);
    }
  });

  it('reicht die dynamischen Werte durch', () => {
    const items = allItems(buildNavSections(OPTS));
    expect(items.find((i) => i.href === '/admin/inbox')?.badge).toBe(3);
    expect(items.find((i) => i.external)?.href).toBe(OPTS.brettUrl);
  });
});
