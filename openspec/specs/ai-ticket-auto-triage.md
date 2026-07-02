# ai-ticket-auto-triage

## Purpose

Automatisiert die Triage von Tickets durch heuristische Regelauswertung und Schweregrad-Klassifizierung.

## Requirements

### Requirement: Automatic-Severity-Triage

The system SHALL automatically evaluate ticket severity at create time using a heuristic rule set (keyword-matching + area-weighting) and apply the result based on confidence level.

#### Scenario: Auto-Apply bei hoher Confidence

- **GIVEN** ein neues Ticket wird angelegt mit Beschreibung die "prod-down" enthält
- **WHEN** heuristik.mjs analysiert das Ticket
- **THEN** wird bei Confidence >90% das Severity-Feld direkt gesetzt (auto-apply)

#### Scenario: Vorschlag-Comment bei mittlerer Confidence

- **GIVEN** ein neues Ticket wird angelegt mit mehrdeutigem Inhalt
- **WHEN** heuristik.mjs analysiert das Ticket
- **THEN** wird bei Confidence 50-90% ein Comment „Vorgeschlagene Severity: X" hinzugefügt

#### Scenario: Keine Aktion bei niedriger Confidence

- **GIVEN** ein neues Ticket ohne Beschreibung wird angelegt
- **WHEN** heuristik.mjs analysiert das Ticket
- **THEN** wird bei Confidence <50% keine Aktion ausgeführt

<!-- merged from change delta ai-ticket-auto-triage.md on 2026-07-01 -->