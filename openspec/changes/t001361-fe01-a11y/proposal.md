---
title: "G-FE01: Accessibility-Tooling einrichten + axe-Core-Baseline"
ticket_id: T001361
status: planning
---

# G-FE01: Accessibility-Tooling einrichten + axe-Core-Baseline

## Warum

Die Website beider Marken (mentolder, korczewski) muss WCAG 2.1 AA / BFSG-konform sein.
Derzeit gibt es keine automatisierte Accessibility-Prüfung — weder lokal noch in der CI.
Ohne Tooling sind Verstöße nur manuell erkennbar, was auf Dauer nicht skalierbar ist.

## Was

- `@axe-core/playwright` als devDependency in `tests/e2e/` installieren
- Eine Playwright-Spec `a11y-axe.spec.ts` anlegen, die Kern-Routen scannt
- CI-Anbindung (nightly e2e) + `task a11y:axe`-Wrapper
- Baseline erfassen: Existing-Violation-Inventar (critical/serious) dokumentieren
- Final Gate: `task test:changed` + `task freshness:regenerate` + `task freshness:check`

_Ticket: T001361_
