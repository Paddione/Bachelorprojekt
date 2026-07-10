---
title: "admin-redirect-map — Implementation Plan"
ticket_id: T001789
domains: [website, admin, routing]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# admin-redirect-map — Implementation Plan

_Ticket: T001789 · Epic: T001786 · Design-Spec: `docs/superpowers/specs/2026-07-10-admin-foundation-design.md` §T2_

## File Structure

Die Redirect-Auflösung wird als **pures Modul** (kein `astro:middleware`-Import) angelegt, damit der
Unit-Test es ohne Astro-Build-Pipeline und ohne `vi.mock('astro:middleware')` importieren kann.
`middleware.ts` konsumiert das Modul und hängt einen `redirectMiddleware`-Handler in die bestehende
`sequence()` ein. Die 21 literalen Einzelziel-Stubs werden gelöscht.

```text
website/src/middleware/redirect-map.ts        NEU  (~35 Z) — REDIRECT_MAP (21 Paare) + resolveRedirect(); pure, kein astro-Import
website/src/middleware/redirect-map.test.ts   NEU  (~45 Z) — Vitest-Tabelle mit allen 21 Pfad->Ziel-Paaren (rot->gruen)
website/src/middleware.ts                      GEAENDERT (15 -> ~30 Z) — redirectMiddleware in sequence() einhaengen
website/src/pages/admin/<21 stubs>.astro       GELOESCHT — literale Einzelziel-Redirect-Stubs (Liste in Task 3)

NICHT ANFASSEN — dynamische Routen mit bedingtem Ziel (kein Literalziel):
  website/src/pages/admin/brett/[...path].astro   Ziel: ${proto}://${brettDomain}/?admin=1
  website/src/pages/admin/brett/index.astro       Ziel: ${proto}://${brettDomain}/?admin=1   (Design-Deck-Liste hatte /admin — per Grep widerlegt)
  website/src/pages/admin/bugs.astro              Ziel: /admin/tickets${Astro.url.search}
  website/src/pages/admin/meetings/[id].astro     Ziel: /admin/live/sessions/${id}

NICHT ANFASSEN — echte Seiten (kein Stub; naive "no-AdminLayout + literal redirect"-Grep wuerde sie faelschlich fangen):
  website/src/pages/admin/billing/[id]/drucken.astro          513 Z, Druckansicht mit Auth-Guard
  website/src/pages/admin/coaching/sessions/[id]/popout.astro  47 Z, Popout-Seite mit Auth-Guard
```

**Extraktions-/Abgrenzungs-Methode (verbindlich).** Ein Stub für die Map ist eine `.astro`-Datei, deren
Frontmatter **keinen `AdminLayout`-Import** hat, **keinen HTML-Body** besitzt und deren **terminale
Anweisung** ein `return Astro.redirect('<literal>', …)` mit **einfach-quotiertem String-Literal** ist.
Dateien mit Template-Literal-Ziel (Backticks, z.B. `` `/admin/live/sessions/${id}` ``) oder mit HTML-Body /
Seitenlogik sind **keine** Stubs und bleiben unverändert. Discovery-Hilfe (nur Diagnose — die 21er-Liste in
Task 3 ist die verbindliche Quelle):

```bash
cd website
for f in $(find src/pages/admin -name '*.astro'); do
  grep -q AdminLayout "$f" && continue                 # echte Seite
  grep -qE "Astro\.redirect\(\`" "$f" && continue       # Backtick-Ziel = dynamisch, ausschliessen
  last=$(grep -oE "Astro\.redirect\('[^']*'" "$f" | tail -1)
  [ -n "$last" ] && [ "$(wc -l < "$f")" -le 12 ] && echo "$f  ->  $last"
done
```

### S1-Budget (Pflicht-Preflight pro geänderter Datei)

`.ts`-Limit = 600. `website/src/middleware.ts` ist **nicht-baselined**, wächst von 15 auf ~30 Zeilen →
unkritisch. Das neue `redirect-map.ts` (~35 Z) liegt weit unter 600. Keine `.astro`-Datei wächst (nur
Löschungen).

| Datei | Ist | Wirksame Schwelle |
|---|---|---|
| `website/src/middleware.ts` | 15 | 585 |

CQ02 (`any`-Gate): Die Auflösefunktion ist voll typisiert (`resolveRedirect(pathname: string): string | null`);
kein `any`, keine Netto-Erhöhung der `any`-Zählung.

<!-- vitest: neuer Test ist Pflicht (STRUCT2, rot->gruen) und deckt die Aufloeselogik vollstaendig ab. -->

## Task 1 — RED: Failing Vitest-Tabelle für `resolveRedirect`

Lege `website/src/middleware/redirect-map.test.ts` an. Der Test importiert `resolveRedirect` aus
`./redirect-map` (existiert noch nicht) und prüft **alle 21** Pfad→Ziel-Paare als Tabelle sowie
Nicht-Treffer (`null`) und Trailing-Slash-Normalisierung. Weil das Modul fehlt, schlägt der Import — und
damit die Suite — fehl.

```ts
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
```

RED ausführen:

```bash
cd website && npx vitest run src/middleware/redirect-map.test.ts
# expected: FAIL — Modul ./redirect-map existiert noch nicht (Import-Fehler), Suite rot.
```

## Task 2 — GREEN: `redirect-map.ts` anlegen und in `middleware.ts` einhängen

Lege `website/src/middleware/redirect-map.ts` an — reines Modul ohne Astro-Import:

```ts
// Backwards-kompatible Weiterleitungen alter Admin-Pfade auf ihre neuen Hub-Ziele.
// Pfad -> Vollziel (inkl. Query-String, zeichengenau). Alle Treffer werden als 301 (permanent)
// ausgeliefert (siehe middleware.ts). Dynamische Routen (bugs, meetings/[id], brett/*) sind
// BEWUSST NICHT enthalten — sie bilden ihr Ziel zur Laufzeit aus Request-Daten.
export const REDIRECT_MAP: Record<string, string> = {
  '/admin/startseite': '/admin/inhalte?tab=website&section=startseite',
  '/admin/uebermich': '/admin/inhalte?tab=website&section=uebermich',
  '/admin/referenzen': '/admin/inhalte?tab=website&section=referenzen',
  '/admin/beratung': '/admin/inhalte?tab=website&section=beratung',
  '/admin/coaching': '/admin/inhalte?tab=website&section=coaching',
  '/admin/angebote': '/admin/inhalte?tab=website&section=angebote',
  '/admin/kontakt': '/admin/inhalte?tab=website&section=kontakt',
  '/admin/faq': '/admin/inhalte?tab=website&section=faq',
  '/admin/50plus-digital': '/admin/inhalte?tab=website&section=50plus-digital',
  '/admin/fuehrung-persoenlichkeit': '/admin/inhalte?tab=website&section=fuehrung-persoenlichkeit',
  '/admin/ki-transition': '/admin/inhalte?tab=website&section=ki-transition',
  '/admin/planungsbuero': '/admin/pipeline?tab=planung',
  '/admin/dora': '/admin/pipeline?tab=analytics',
  '/admin/factory-budget': '/admin/pipeline?tab=kosten',
  '/admin/factory-observability': '/admin/pipeline?tab=kosten',
  '/admin/ops': '/admin/platform',
  '/admin/monitoring': '/admin/platform',
  '/admin/tickets': '/admin/cockpit',
  '/admin/stream': '/admin/live',
  '/admin/newsletter': '/admin/dokumente',
  '/admin/wissensquellen': '/admin/wissen',
};

/** Loest einen eingehenden Pfad auf sein Redirect-Ziel auf, oder null bei keinem Treffer.
 *  Ein einzelner Trailing-Slash wird abgestreift (Astro trailingSlash:'ignore'), Root bleibt. */
export function resolveRedirect(pathname: string): string | null {
  const key = pathname.length > 1 && pathname.endsWith('/') ? pathname.slice(0, -1) : pathname;
  return REDIRECT_MAP[key] ?? null;
}
```

`website/src/middleware.ts` erweitern: `resolveRedirect` importieren, einen `redirectMiddleware`-Handler
definieren und **zwischen** `loggingMiddleware` und `localeMiddleware` in die `sequence()` hängen (nach dem
Logging — der Treffer wird noch als Request geloggt — aber vor Locale/Route-Rendern). Bei einem Treffer wird
die Kette per `context.redirect(target, 301)` kurzgeschlossen; ohne Treffer läuft `next()` und die bestehende
Locale-Kette unverändert weiter.

```ts
import { resolveRedirect } from './middleware/redirect-map';

const redirectMiddleware = defineMiddleware(async (context, next) => {
  const target = resolveRedirect(context.url.pathname);
  if (target) return context.redirect(target, 301);
  return next();
});

export const onRequest = sequence(loggingMiddleware, redirectMiddleware, localeMiddleware);
```

Astro-Middleware läuft **vor** der Route-Auflösung — auch für Pfade ohne passende Route. Sobald in Task 3
die Stub-Dateien gelöscht sind, fängt dieser Handler die alten Pfade ab, bevor Astro einen 404 rendern
würde. GREEN verifizieren inkl. Regression der bestehenden Middleware-Suite:

```bash
cd website && npx vitest run src/middleware/redirect-map.test.ts src/middleware.test.ts
# erwartet: beide Suites gruen — die neue Tabelle passt, und middleware.test.ts (nicht-gemappte Pfade
# -> next()) bleibt unveraendert gruen.
```

## Task 3 — Die 21 literalen Einzelziel-Stubs löschen

Nur diese 21 Dateien entfernen (jede exakt als Key in der `REDIRECT_MAP` vertreten). Die vier dynamischen
Routen und die zwei echten Seiten aus `## File Structure` bleiben unangetastet.

```bash
cd website && git rm \
  src/pages/admin/startseite.astro \
  src/pages/admin/uebermich.astro \
  src/pages/admin/referenzen.astro \
  src/pages/admin/beratung.astro \
  src/pages/admin/coaching.astro \
  src/pages/admin/angebote.astro \
  src/pages/admin/kontakt.astro \
  src/pages/admin/faq.astro \
  src/pages/admin/50plus-digital.astro \
  src/pages/admin/fuehrung-persoenlichkeit.astro \
  src/pages/admin/ki-transition.astro \
  src/pages/admin/planungsbuero.astro \
  src/pages/admin/dora.astro \
  src/pages/admin/factory-budget.astro \
  src/pages/admin/factory-observability.astro \
  src/pages/admin/ops.astro \
  src/pages/admin/monitoring.astro \
  src/pages/admin/tickets.astro \
  src/pages/admin/stream.astro \
  src/pages/admin/newsletter.astro \
  src/pages/admin/wissensquellen.astro
```

Danach gegenprüfen, dass keine gelöschte Stub-Route Fehler wirft (interne Links funktionieren weiter — sie
treffen jetzt die 301-Kette statt den Stub):

```bash
cd website && npx astro check 2>&1 | tail -20   # keine neuen Fehler durch fehlende Seiten
```

## Task 4 — Final Verification (mandatory CI gates)

Vor Commit die OpenSpec-Validierung grün ziehen; nach der Test-Änderung das Test-Inventar regenerieren und
mitcommitten; dann die drei Pflicht-Gates ausführen.

```bash
task test:openspec                 # OpenSpec-Tree valide (muss gruen sein, bevor committet wird)
task test:inventory                # test-inventory.json neu erzeugen (neue redirect-map.test.ts)
git add website/src/data/test-inventory.json
task test:changed                  # gezielte Tests der geaenderten Domains (vitest --changed + BATS + quality)
task freshness:regenerate          # generierte Artefakte aktualisieren
task freshness:check               # CI-Aequivalent: Freshness + quality:check (S1-S4-Ratchet) + Baseline-Assertion
```

- **Test-Assertion-Konsistenz:** Die 21 Paare in `redirect-map.test.ts` (`CASES`) müssen byte-für-byte der
  `REDIRECT_MAP` in `redirect-map.ts` entsprechen (inkl. Query-Strings). Der `REDIRECT_MAP`-Keys-Test aus
  Task 1 erzwingt das automatisch (rot bei jedem Drift).
- **Backwards-Compat:** Jeder alte Pfad liefert weiterhin sein exaktes bisheriges Ziel — jetzt einheitlich
  als `301` (permanent) statt teils `302`; externe Bookmarks bleiben gültig.
