K6: Ticket- und Factory-Datenmodell visualisieren

## Purpose

Kind-Ticket von T002430 (Brain-Architektur EPIC). Visualisiert das Ticket-System (tickets.tickets, ticket_links, ticket_plans, factory_phase_events) und die Software Factory (queue.sh, wakeup.sh, dispatcher-bridge.sh).

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
- Ablage: docs/brain/k6-ticket-factory.md
