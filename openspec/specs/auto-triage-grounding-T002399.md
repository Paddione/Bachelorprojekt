# auto-triage-grounding-T002399

## Purpose

_Purpose fehlt — beim nächsten inhaltlichen Delta zu auto-triage-grounding-T002399 ergänzen._

## Requirements

### Requirement: Auto-Triage holt ähnliche Tickets als Grounding-Kontext

The system SHALL, before invoking the LLM for ticket triage, retrieve the top-N similar
tickets via `find_similar` and append them to the prompt as a "Ähnliche Vorgänge" block, so
that the triage decision is grounded in prior tickets instead of relying on title and
description alone.

#### Scenario: Ähnliche Tickets werden vor dem LLM-Aufruf angehängt

- **GIVEN** `scripts/factory/auto-triage.sh` klassifiziert ein neues Ticket
- **WHEN** der LLM-Aufruf vorbereitet wird
- **THEN** werden die Top-N ähnlichen Tickets via `find_similar` geladen
- **AND** der Prompt enthält einen "Ähnliche Vorgänge"-Block mit diesen Tickets

#### Scenario: Keine ähnlichen Tickets vorhanden

- **GIVEN** `find_similar` liefert eine leere Trefferliste
- **WHEN** der Prompt gebaut wird
- **THEN** wird der "Ähnliche Vorgänge"-Block weggelassen
- **AND** die Triage läuft trotzdem mit Titel und Beschreibung weiter

### Requirement: Auto-Triage hängt optionale Tool-Definitionen an und bleibt fail-soft

The system SHALL optionally append tool definitions from `GET /tools` to the prompt and, when
needed, run a follow-up round via `POST /tools`. If tool-calling fails, the system SHALL fall
back to the grounding-only path (Stufe 1) without aborting the triage.

#### Scenario: Tool-Calling ist verfügbar

- **GIVEN** der LLM-Provider unterstützt Tool-Calling
- **WHEN** die Triage läuft
- **THEN** werden Tool-Definitionen aus `GET /tools` an den Prompt angehängt
- **AND** bei Bedarf wird eine Nachfassrunde via `POST /tools` ausgeführt

#### Scenario: Tool-Calling fällt aus

- **GIVEN** `GET /tools` oder `POST /tools` schlägt fehl
- **WHEN** die Triage läuft
- **THEN** bleibt die Stufe-1-Grounding-Logik aktiv
- **AND** die Triage bricht nicht ab, sondern liefert das Ergebnis aus dem Kontext-Prompt

<!-- merged from change delta auto-triage-grounding-T002399.md (2843a7b87fc0) -->