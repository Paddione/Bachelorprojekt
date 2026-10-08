---
title: "kunden-detail-imports — Falsche Import-Tiefe in owner/kunden Detailseite"
ticket_id: T901263
domains: [website, owner-workspace]
status: active
---

# kunden-detail-imports — Implementation Plan

## File Structure

- `components/website/src/pages/owner/kunden/[id].astro`: fix, Import-Tiefe 4 auf 3 Ebenen korrigieren.
- `tests/spec/client-directory.bats`: RED-Guard T901263-1, bereits im Stage-Commit enthalten.
- `components/website/src/data/test-inventory.json`: generiert, Inventar für die neue Test-ID.

## Zweck

Die Kunden-Detailseite des Owner-Bereichs importiert Lib-Module mit einer
Ebene zu viel (`../../../../lib/...`), sodass `astro check` Errors meldet und
`astro build` abbricht. Der Fix korrigiert die vier Import-Zeilen auf
`../../../lib/...` und macht den mitgelieferten Guard grün.

## Scope and evidence

Work only in `.worktrees/kunden-detail-imports` on `fix/kunden-detail-imports-T901263`.
Base ist origin/main. Der lokale Haupt-Checkout bleibt unangetastet.

Triage, Symptom und Ursache getrennt: Symptom ist der rote `astro check` mit
Errors in der Detailseite. Ursache ist die falsche relative Import-Tiefe: die
Datei liegt in `src/pages/owner/kunden/`, also drei Ebenen unter `src/`,
importiert aber mit vier `../`-Segmenten. Evidenz: die Geschwisterdatei
`rechnungen/[id].astro` auf gleicher Tiefe nutzt korrekt drei Ebenen; die
Suche über `pages/owner/` zeigt genau eine betroffene Datei; der neue Guard
T901263-1 weist alle vier unauflösbaren Imports namentlich nach.

Scope: nur die Import-Tiefe dieser einen Datei. Keine Logikänderung, keine
neuen Routen, keine API-Änderung.

## Partials

| id | file | role | target_files | depends_on |
|----|------|------|--------------|------------|
| p1 | tasks.d/p1-import-depth.md | impl | `components/website/src/pages/owner/kunden/[id].astro` |  |
| p2 | tasks.d/p2-tests.md | tests | `tests/spec/client-directory.bats`, `components/website/src/data/test-inventory.json` | p1 |

## Tasks

- [ ] **0. Rotphase: Failing-Test-Step zuerst** (`tasks.d/p2-tests.md`
  Schritt 1): Guard gegen den ungefixten Stand laufen lassen, Rot beobachten.
  Erst danach beginnt Partial p1.
- [ ] **1. Partial p1 ausführen** (`tasks.d/p1-import-depth.md`): vier
  Import-Zeilen korrigieren. Verify pro Partial-Plan.
- [ ] **2. Partial p2 ausführen** (`tasks.d/p2-tests.md`): Guard grün
  beweisen, Inventar regenerieren und mitcommitten. Verify pro Partial-Plan.
- [ ] **3. Abschluss-Verifikation.** Im Worktree ausführen:
  `task test:changed`, `task freshness:regenerate`, `task freshness:check`.
  Alle drei müssen grün sein.
