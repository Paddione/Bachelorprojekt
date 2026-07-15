---
ticket: T001841
health_goal: G-CI03
---

# G-CI03: CI Pipeline p95 Duration

## Purpose

CI-Latenz messen und optimieren, um Developer Velocity zu erhöhen. Aktuell gibt es keine Messung. Ziel: p95 über die letzten 20 Runs auf main ≤ 12 Minuten.

## Requirements

### Requirement: CI-Dauer messen

Die CI-Pipeline muss ihre Gesamtdauer loggen, damit der p95-Wert berechnet werden kann.

**Scenarios:**

GITHUB Actions CI-Run auf main abschließt
WHEN die Run-Dauer aus `github.event.workflow_run.timing` oder `gh run view` extrahiert wird
THEN wird der Wert in eine Messdatei geschrieben

### Requirement: p95-Berechnung in health-goals-check.sh

`health-goals-check.sh` muss den p95-Wert der letzten 20 Runs berechnen und mit dem Ziel (≤12 min) vergleichen.

**Scenarios:**

GIVEN die Messdatei enthält ≥20 Einträge
WHEN `health-goals-check.sh` läuft
THEN wird der p95-Wert berechnet und in goals.md aktualisiert

GIVEN weniger als 20 Einträge
WHEN der Check läuft
THEN wird der aktuelle Durchschnitt als Provvisorium verwendet

### Requirement: Optimierte Pipeline

Bei Überschreitung des Ziels (>12 min p95) müssen Optimierungen identifiziert und umgesetzt werden.

**Scenarios:**

GIVEN p95 > 12 Minuten
WHEN die Analyse läuft
THEN werden die langsamsten Jobs identifiziert

GIVEN ein Job ist unnötig langsam
WHEN er optimiert wird (Caching, Parallelisierung, Skip-Logik)
THEN sinkt die Gesamtdauer

## Non-Goals

- Keine perfekte Messung ab Run 1 — schrittweise Annäherung
- Keine Blocking bei Überschreitung (nur Monitoring + Optimierung)
- Keine Nightly-Runs einbeziehen (nur main-Pipeline)
