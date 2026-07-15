---
ticket: T001828
health_goal: G-GIT03
---

# G-GIT03: Dateien >1MB reduzieren (7→≤6)

## Purpose

Git-Repository von großen Dateien bereinigen, um Clone-Zeiten und Repository-Größe zu reduzieren. Aktuell gibt es 7 Dateien >1MB im Tree, Ziel ist ≤6.

Die 7 Kandidaten:
1. `k3d/monitoring/kube-prometheus-stack-rendered.yaml` (4.8 MB) — Helm-Rendering, muss bleiben
2. `k3d/docs-content-built/datamodel-workflow.html` (2.3 MB) — generiert
3. `docs/legacy-html/datamodel-workflow.html` (2.3 MB) — Legacy
4. `k3d/docs-content-built/db-schema.html` (2.2 MB) — generiert
5. `k3d/docs-content-built/datamodel.html` (2.1 MB) — generiert
6. `docs/legacy-html/db-schema.html` (2.0 MB) — Legacy
7. `k3d/docs-content-built/feature-map.html` (1.8 MB) — generiert

## Requirements

### Requirement: Generierte Dateien aus .gitignore ausschließen

Die `k3d/docs-content-built/` Dateien sind Build-Output und gehören nicht in den Git-Tree.

**Scenarios:**

GIVEN Dateien in `k3d/docs-content-built/` sind >1MB
WHEN `.gitignore` um `k3d/docs-content-built/` ergänzt wird
THEN verschwinden diese Dateien aus dem Git-Tree (bei nächstem Clone)

### Requirement: Legacy-HTML aufräumen

`docs/legacy-html/` enthält veraltete HTML-Dateien, die potenziell löschbar sind.

**Scenarios:**

GIVEN `docs/legacy-html/` enthält Dateien >1MB
WHEN diese Dateien nicht mehr referenziert werden
THEN können sie gelöscht oder in .gitignore verschoben werden

### Requirement: Baseline-Check

Vor und nach der Bereinigung muss geprüft werden, wie viele Dateien >1MB existieren.

**Scenarios:**

GIVEN der Check läuft
WHEN `find . -size +1M -not -path './.git/*' | wc -l` ausgeführt wird
THEN ist das Ergebnis ≤6 (nach Änderung)

## Non-Goals

- Helm-Rendered-File (4.8 MB) nicht entfernen — wird für Monitoring gebraucht
- Kein Git-LFS für große Dateien (Overhead zu hoch für diesen Anwendungsfall)
