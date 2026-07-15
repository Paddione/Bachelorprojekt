---
ticket: T001831
health_goal: G-DB03
---

# G-DB03: brand-Spalten CHECK-Constraints ergänzen (44→0)

## Purpose

Foreign-Key-ähhnliche CHECK-Constraints auf brand-Spalten ergänzen, um Datenintegrität auf DB-Ebene zu gewährleisten. Aktuell gibt es 44 Tabellen ohne CHECK-Constraint auf der brand-Spalte, Ziel ist 0.

## Requirements

### Requirement: Fehlende CHECK-Constraints identifizieren

via `pg_constraint` muss ermittelt werden, welche Tabellen mit brand-Spalte keinen CHECK-Constraint haben.

**Scenarios:**

GIVEN die Abfrage läuft
WHEN Tabellen mit brand-Spalte ohne CHECK-Constraint gefunden werden
THEN werden sie als Liste ausgegeben

### Requirement: Constraints mit ALTER TABLE ergänzen

Die Constraints müssen online ergänzt werden.

**Scenarios:**

GIVEN eine Tabelle hat eine brand-Spalte ohne CHECK-Constraint
WHEN `ALTER TABLE ... ADD CONSTRAINT ... CHECK (brand IN ('mentolder','korczewski'))` ausgeführt wird
THEN ist die Datenintegrität gesichert

### Requirement: Baseline in goals.md

G-DB03 Current Value muss auf 0 gesetzt werden.

**Scenarios:**

GIVEN alle 44 Constraints ergänzt
WHEN `health-goals-check.sh` läuft
THEN zeigt G-DB03: 0 fehlende Constraints

## Non-Goals

- Keine Trigger-basierte Lösung (nur CHECK-Constraints)
- Keine Migration auf ein anderes Brand-Modell
