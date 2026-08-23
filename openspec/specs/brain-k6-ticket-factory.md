# brain-k6-ticket-factory

## Purpose

_Purpose fehlt — beim nächsten inhaltlichen Delta zu brain-k6-ticket-factory ergänzen._

## Requirements

### Requirement: Diagramm mit beschrifteten Kanten (REQ-k6-01)

#### Scenario: Diagramm-Erstellung

**GIVEN** die Brain-Architektur wird dokumentiert
**WHEN** K6 erstellt wird
**THEN** existiert ein Diagramm mit beschrifteten Knoten und Kanten, das die zwei brand-getrennten Ticket-DBs (mentolder, korczewski) mit überlappendem `external_id`-Raum sowie den Zugriffspfad über `ticket-mcp`/`scripts/ticket.sh` und `factory-mcp` (:13003) darstellt

### Requirement: Vollständige Erhebung (REQ-k6-02)

#### Scenario: Erhebung der Schnittstellen

**GIVEN** die Komponente hat spezifische Datenquellen und Schnittstellen
**WHEN** die Dokumentation wird erstellt
**THEN** sind alle relevanten Aspekte erfasst (welche Tabellen existieren und welche gefüllt sind, wer schreibt, wer liest, wie "Merge gleich Abschluss" implementiert ist)

### Requirement: Defekt-Referenz (REQ-k6-03)

#### Scenario: Defekt-Zuordnung

**GIVEN** T002430 definiert die Defekte D1-D9
**WHEN** K6 wird dokumentiert
**THEN** ist Defekt D2 (`ticket_plans` formal referenziert) referenziert und ihr aktueller, gemessener Status dokumentiert

<!-- merged from change delta brain-k6-ticket-factory.md (4184f391a6a1) -->

### Requirement: factory_control hat einen Primary Key und dedupliziert Globaleinträge

Die Tabelle `tickets.factory_control` SHALL einen Primary Key tragen. Die Eindeutigkeit von
`(key, brand)` SHALL auch für Zeilen mit `brand IS NULL` gelten (Postgres-`UNIQUE NULLS NOT
DISTINCT`), damit globale Steuerschlüssel nicht pro Tick dupliziert werden.

Das Global-Semantik-Muster (`brand NULL = global`) SHALL erhalten bleiben: `brand` bleibt
nullable, Reads mit `brand IS NULL` bleiben gültig.

#### Scenario: Doppel-Insert eines globalen Schlüssels

- **GIVEN** eine Zeile mit `key='last-tick-at'`, `brand IS NULL` existiert
- **WHEN** ein Writer `INSERT … ON CONFLICT (key, brand)` für denselben Schlüssel ausführt
- **THEN** wird die bestehende Zeile aktualisiert (Upsert greift)
- **AND** es entsteht keine zweite Zeile

#### Scenario: Migration auf Bestandstabelle

- **GIVEN** die Live-Tabelle enthält Duplikatzeilen für `(key, brand IS NULL)`
- **WHEN** `applyFactoryControlSchema` beim Start läuft
- **THEN** werden Duplikate kollabiert (neueste `updated_at` bleibt)
- **AND** Primary Key und NULLS-NOT-DISTINCT-Constraint sind vorhanden
- **AND** ein erneuter Lauf der Migration ist ein No-op (idempotent)

<!-- merged from change delta brain-k6-ticket-factory.md (ee3f8600e841) -->