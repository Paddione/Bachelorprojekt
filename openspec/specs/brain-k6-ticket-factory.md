# brain-k6-ticket-factory

## Purpose

_Purpose fehlt — beim nächsten inhaltlichen Delta zu brain-k6-ticket-factory ergänzen._

## Requirements

### Requirement: Diagramm mit beschrifteten Kanten (REQ-k6-01)

**GIVEN** die Brain-Architektur wird dokumentiert
**WHEN** K6 erstellt wird
**THEN** existiert ein Diagramm mit beschrifteten Knoten und Kanten, das die zwei brand-getrennten Ticket-DBs (mentolder, korczewski) mit überlappendem `external_id`-Raum sowie den Zugriffspfad über `ticket-mcp`/`scripts/ticket.sh` und `factory-mcp` (:13003) darstellt

### Requirement: Vollständige Erhebung (REQ-k6-02)

**GIVEN** die Komponente hat spezifische Datenquellen und Schnittstellen
**WHEN** die Dokumentation wird erstellt
**THEN** sind alle relevanten Aspekte erfasst (welche Tabellen existieren und welche gefüllt sind, wer schreibt, wer liest, wie "Merge gleich Abschluss" implementiert ist)

### Requirement: Defekt-Referenz (REQ-k6-03)

**GIVEN** T002430 definiert die Defekte D1-D9
**WHEN** K6 wird dokumentiert
**THEN** ist Defekt D2 (`ticket_plans` formal referenziert) referenziert und ihr aktueller, gemessener Status dokumentiert

<!-- merged from change delta brain-k6-ticket-factory.md (4184f391a6a1) -->