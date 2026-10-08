---
title: "nav-overflow — Mobile Header-Overflow bei 412px Viewport"
ticket_id: T901310
domains: [website, navigation]
status: active
---

# nav-overflow — Implementation Plan

## File Structure

- `components/website/src/components/Navigation.svelte`: fix, mobile Breakpoint um CTA-Versteck und Brand-Ellipsis erweitern.
- `tests/spec/navigation-responsive.bats`: RED-Guards T901310-1..2, bereits im Stage-Commit enthalten.
- `components/website/src/data/test-inventory.json`: generiert, Inventar für die neuen Test-IDs.

## Zweck

Bei 412px Viewport ist das Layout 513px breit: Markenname, CTA-Pill und
Hamburger passen nicht nebeneinander, der Menü-Button liegt außerhalb des
sichtbaren Bereichs. Der Fix erweitert den bestehenden 860px-Breakpoint:
CTA-Pill ausblenden (Kontakt bleibt über das Mobil-Menü erreichbar),
Brand schrumpfbar mit Ellipsis. Keine Änderung der Bildsprache, nur
Overflow-Eindämmung.

## Scope and evidence

Work only in `.worktrees/nav-overflow` on `fix/nav-overflow-T901310`.
Base ist origin/main. Der lokale Haupt-Checkout bleibt unangetastet.

Triage, Symptom und Ursache getrennt: Symptom ist der fehlschlagende
FA-63-Tap auf den Menü-Button (nav-cta intercepts) plus innerWidth 513 bei
visualViewport 412. Ursache ist die nicht umbrechende Header-Zeile:
`.nav-right` reicht bis x=513 (CTA 150px nowrap + Toggle, dazu langer
Markenname). Evidenz: Playwright-Probe mit Pixel-7-Gerät (Boxen, Hit-Test,
visualViewport), Fehler-Screenshot, FA-63 M1/M2 rot. NavMobile enthält einen
Kontakt-Link, daher strandert das Ausblenden der CTA niemanden.

Scope: nur der 860px-Block in Navigation.svelte. Keine Logikänderung, keine
neuen Routen, keine Breakpoint-Neueinführung.

## Partials

| id | file | role | target_files | depends_on |
|----|------|------|--------------|------------|
| p1 | tasks.d/p1-header-css.md | impl | `components/website/src/components/Navigation.svelte` |  |
| p2 | tasks.d/p2-tests.md | tests | `tests/spec/navigation-responsive.bats`, `components/website/src/data/test-inventory.json` | p1 |

## Tasks

- [ ] **0. Rotphase: Failing-Test-Step zuerst** (`tasks.d/p2-tests.md`
  Schritt 1): Guards gegen den ungefixten Stand laufen lassen, Rot beobachten.
  Erst danach beginnt Partial p1.
- [ ] **1. Partial p1 ausführen** (`tasks.d/p1-header-css.md`): Breakpoint
  erweitern. Verify pro Partial-Plan.
- [ ] **2. Partial p2 ausführen** (`tasks.d/p2-tests.md`): Guards grün
  beweisen, Inventar regenerieren und mitcommitten. Verify pro Partial-Plan.
- [ ] **3. Abschluss-Verifikation.** Im Worktree ausführen:
  `task test:changed`, `task freshness:regenerate`, `task freshness:check`.
  Alle drei müssen grün sein.
