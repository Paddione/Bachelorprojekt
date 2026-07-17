---
ticket: T001830
health_goal: G-DB01
---

# G-DB01: Fehlende FK-Indizes ergänzen (4→0)

## Purpose

Foreign-Key-Spalten ohne passenden Index identifizieren und Indizes ergänzen, um JOIN-Performance zu verbessern. Aktuell gibt es 4 FK-Spalten ohne Index, Ziel ist 0.

## Requirements

### Requirement: Fehlende Indizes identifizieren

via `pg_constraint` + `pg_class` muss ermittelt werden, welche FK-Spalten keinen passenden Single-Column-Index haben.

**Scenarios:**

GIVEN die Abfrage läuft gegen die produktive DB
WHEN FK-Spalten ohne Index gefunden werden
THEN werden sie als Liste ausgegeben (Tabelle, Spalte, Index-Name)

### Requirement: Indizes mit CREATE INDEX CONCURRENTLY erstellen

Die Indizes müssen online erstellt werden (kein Lock auf die Tabelle).

**Scenarios:**

GIVEN eine Tabelle hat eine FK-Spalte ohne Index
WHEN `CREATE INDEX CONCURRENTLY` ausgeführt wird
THEN entsteht kein Table-Lock und der Index wird erstellt

### Requirement: Baseline in goals.md aktualisieren

G-DB01 Current Value muss auf 0 gesetzt werden nach Abschluss.

**Scenarios:**

GIND alle 4 Indizes erstellt
WHEN `health-goals-check.sh` läuft
THEN zeigt G-DB01: 0 fehlende Indizes

## Non-Goals

- Keine Index-Optimierung für Multi-Column-FK
- Keine Partitionierung
- Keine automatische Index-Verwaltung (nur manuelle Korrektur)
