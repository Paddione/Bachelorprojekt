# p1 — Smoke + axe für mentolder-web (neu, live)

## Spec `tests/e2e/specs/mentolder-web-smoke.spec.ts` (≈ 90 Zeilen)
Konstante `BASE = 'https://react.mentolder.de'` (kein Env-Override nötig —
Host ist fix; S3-konform, da kein Brand-Literal sondern Spec-Gegenstand).
Konstante `ROUTES = ['/', '/leistungen', '/kontakt', '/impressum',
'/barrierefreiheit']` (Kernrouten aus `App.tsx`; kein `/leistungen/:slug`,
kein `/admin`, kein Catch-all).

Je Route zwei Tests (Muster docs-smoke + a11y-axe):
1. `render`: `GET → 200`, sichtbarer Text ohne `undefined`/`NaN`/
   `[object Object]`, kein horizontaler Overflow
   (`document.documentElement.scrollWidth <= innerWidth`, Desktop-Viewport;
   mobil entfällt — reduziert per D4).
2. `axe`: `AxeBuilder({ page }).withTags(['wcag2a','wcag2aa','wcag21a',
   'wcag21aa']).analyze()`, Filter critical/serious, `expect(...).toBe(0)`
   mit Befund-Ausgabe (IDs + Targets). `reducedMotion`-Emulation wie Vorbild.

## Randbedingungen
- Öffentlich, kein Auth; Kontaktformular NUR rendern (nie absenden).
- Nightly-Config: prüfen, ob `tests/e2e/playwright.config.ts` per Glob oder
  Liste matcht — nur bei Listen-Match EINEN Eintrag ergänzen (Haupt-Config
  minimal anfassen; Begründung im Commit-Body). Local-Config unangetastet.
- Befunde über Triviales hinaus → B3 (Folge-PR + Issue-Kommentar in #7051
  erwägen, kein Fix hier).

## Gates
- `npx playwright test mentolder-web-smoke` live grün oder B3-Befund
  dokumentiert (Route + IDs + Screenshot-Pfad → phase-events.log).
- `tsc`-sauber im e2e-Typkontext (wie p1/p2 Staffel A: `tsc fa-..-clean`).
