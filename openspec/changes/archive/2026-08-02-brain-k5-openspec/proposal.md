K5: OpenSpec (SSOT-Specs und Changes) visualisieren

## Purpose

Kind-Ticket von T002430 (Brain-Architektur EPIC). Visualisiert das OpenSpec-System — SSOT-Specs unter openspec/specs/, Changes unter openspec/changes/, den openspec.sh-CLI-Workflow und die pgvector-Integration (T001008).

## Requirements

### REQ-01: Diagramm mit beschrifteten Kanten

**GIVEN** die Brain-Architektur wird dokumentiert
**WHEN** diese Komponente erstellt wird
**THEN** existiert ein Diagramm mit beschrifteten Knoten und Kanten

### REQ-02: Vollständige Erhebung

**GIVEN** die Komponente hat spezifische Datenquellen und Schnittstellen
**WHEN** die Dokumentation wird erstellt
**THEN** sind alle relevanten Aspekte erfasst (Datenquellen, Transport, Konsumenten)

### REQ-03: Defekt-Referenz

**GIVEN** das Epic T002430 definiert Defekte (D1-D8)
**WHEN** die Komponente wird dokumentiert
**THEN** sind die für diese Komponente relevanten Defekte referenziert

## Scope

- Kein Code — reine Dokumentation und Visualisierung
- Ablage: docs/brain/k5-openspec.md
