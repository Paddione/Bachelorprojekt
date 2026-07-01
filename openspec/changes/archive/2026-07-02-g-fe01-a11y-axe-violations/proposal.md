# Proposal: g-fe01-a11y-axe-violations

## Why

Beide Marken (`web.mentolder.de`, `web.korczewski.de`) müssen WCAG 2.1 AA
einhalten — das ist seit dem BFSG (Barrierefreiheitsstärkungsgesetz,
gültig ab 2025) eine rechtliche Pflicht für gewerbliche Web-Angebote, nicht
nur Best Practice. Aktuell gibt es keinen automatisierten a11y-Check: Verstöße
(fehlende `alt`-Texte, unzureichender Farbkontrast, nicht benannte
Icon-Buttons, fehlendes `lang`-Attribut) können unbemerkt in Produktion gehen
und stellen ein Compliance- und Haftungsrisiko dar.

Die Kern-Routen (Einstiegsseiten mit dem höchsten Traffic) sind die kritischste
Fläche: hier landen Erstbesucher und potenzielle Kunden. axe-core stuft
Verstöße in `minor`/`moderate`/`serious`/`critical` ein — `serious` und
`critical` sind die Klassen, die echte Nutzungsbarrieren bedeuten (z. B.
Screenreader-Blocker, unlesbarer Text). Diese müssen auf **0** stehen.

## What

- `@axe-core/playwright` als devDependency im Playwright-Runner (`tests/e2e/`)
  ergänzen — **nicht** in `website/`, da `website/tests/**/*.spec.ts` von
  Vitest eingesammelt würde (siehe `website/vitest.config.ts`); Playwright-Specs
  müssen vom Vitest-Lauf getrennt bleiben.
- Eine Playwright-Spec `tests/e2e/specs/a11y-axe.spec.ts`, die je Marke die
  Kern-Routen scannt und auf 0 `critical`/`serious`-Violations prüft.
  Brand-Erkennung über `PROD_DOMAIN` (env-basiert, keine Domain-Literale im
  Code) — `korczewski.de` → nur `/` (Kore-Homepage), sonst die
  mentolder-Routen `/`, `/ueber-mich`, `/kontakt`, `/coaching` (repräsentative
  `[service]`-Route).
- Die gefundenen `critical`/`serious`-Violations auf den Kern-Routen beider
  Marken beheben (ARIA-Labels, `alt`-Texte, Farbkontrast, `lang`-Attribut,
  benannte Buttons/Links) — bevorzugt netto-neutral an bestehenden Elementen.
- CI-Anbindung: Die Spec läuft über das bestehende `website`-Projekt
  automatisch im nächtlichen `e2e.yml`-Lauf gegen beide Marken; zusätzlich ein
  `task a11y:axe ENV=<brand>`-Wrapper für lokale/manuelle Verifikation vor dem
  Merge.

_Ticket: T001206_
