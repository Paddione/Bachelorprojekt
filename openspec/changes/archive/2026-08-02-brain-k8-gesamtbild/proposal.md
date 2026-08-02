K8: Komponenten verknuepfen — Gesamtbild und Defektliste

## Purpose

Kind-Ticket von T002430 (Brain-Architektur EPIC). Verknüpft K1-K7 zu einem Gesamtbild und erstellt die vollständige Defektliste (D1-D8). Letztes Kind des Brain-Architektur-Epics.

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
- Ablage: docs/brain/k8-gesamtbild.md
