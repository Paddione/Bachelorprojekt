---
ticket: T001839
health_goal: G-DB10
---

# G-DB10: Unused Indexes

## Purpose

Ungenutzte Datenbank-Indizes identifizieren und entfernen, um Schreib-Performance zu verbessern und Speicher zu sparen. Aktuell gibt es keine Messung. Ziel: 0 unused Indexes.

## Requirements

### Requirement: Ungenutzte Indize identifizieren

via `pg_stat_user_indexes` muss ermittelt werden, welche Indizes seit Erstellung nie genutzt wurden (idx_scan = 0).

**Scenarios:**

GIVEN die Abfrage läuft gegen die produktive DB
WHEN Indize mit `idx_scan = 0` gefunden werden
THEN werden sie als Liste ausgegeben (Tabelle, Index-Name, Größe)

### Requirement: Safe Drop mit CONCURRENTLY

Die Indize müssen sicher entfernt werden, ohne Lock-Probleme.

**Scenarios:**

GIVEN ein ungenutzter Index wird identifiziert
WHEN `DROP INDEX CONCURRENTLY` ausgeführt wird
THEN verschwindet der Index ohne Table-Lock

### Requirement: Baseline in goals.md

G-DB10 Current Value muss auf 0 gesetzt werden nach Abschluss.

**Scenarios:**

GIVEN alle ungenutzten Indize entfernt
WHEN `health-goals-check.sh` läuft
THEN zeigt G-DB10: 0 unused Indexes

## Non-Goals

- Keine automatische Index-Überwachung (nur manuelle Bereinigung)
- Keine partiellen Indizes
- Keine Index-Creator-Tools
