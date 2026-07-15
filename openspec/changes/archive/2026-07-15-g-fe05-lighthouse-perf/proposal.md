---
ticket: T001842
health_goal: G-FE05
---

# G-FE05: Lighthouse Performance Score

## Purpose

Website-Performance über Lighthouse messen und optimieren. Aktuell gibt es keine Messung. Ziel: Performance Score ≥ 90.

## Requirements

### Requirement: Lighthouse-Messung in CI

Die CI-Pipeline muss regelmäßig Lighthouse-Scans durchführen und den Performance Score loggen.

**Scenarios:**

GIVEN die Website wird gebaut
WHEN ein Lighthouse-Audit läuft
THEN wird der Performance Score extrahiert und in eine Messdatei geschrieben

### Requirement: Score in goals.md tracking

`health-goals-check.sh` muss den Lighthouse Score auslesen und mit dem Ziel (≥90) vergleichen.

**Scenarios:**

GIVEN die Messdatei enthält Lighthouse-Scores
WHEN `health-goals-check.sh` läuft
THEN wird der aktuelle Score in goals.md bei G-FE05 aktualisiert

### Requirement: Performance-Optimierung

Bei Score < 90 müssen Optimierungen identifiziert und umgesetzt werden.

**Scenarios:**

GIVEN Lighthouse Score < 90
WHEN die Analyse läuft
THEN werden die Top-3 Optimierungshebel identifiziert

## Non-Goals

- Keine E2E-Tests (nur Performance-Metrik)
- Keine SEO- oder Accessibility-Audits (nur Performance)
- Keine Blockierung bei Score < 90 (nur Monitoring)
