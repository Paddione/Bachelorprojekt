# fix-ticket-tracking-T002279

## Purpose

_Purpose fehlt — beim nächsten inhaltlichen Delta zu fix-ticket-tracking-T002279 ergänzen._

## Requirements

### Requirement: Beiläufig gefixte Tickets werden beim Merge geschlossen

The system SHALL, when a PR is merged, scan the commit messages and diffs for ticket
references that were incidentally fixed, trace each referenced ticket back, and set it to
`done`, so that a bug fixed in passing as part of another ticket does not remain stuck in
`triage` or `planning`.

#### Scenario: Commit referenziert ein beiläufig gefixtes Ticket

- **GIVEN** ein PR wird gemergt und seine Commits referenzieren ein Bug-Ticket
- **WHEN** der Post-Merge-Schritt die Commit-Messages und Diffs durchsucht
- **THEN** wird das referenzierte Ticket auf `done` gesetzt
- **AND** der Kreis zurück zum Ticket ist geschlossen

#### Scenario: Kein Ticket-Verweis im Commit

- **GIVEN** ein PR wird gemergt, dessen Commits kein Ticket referenzieren
- **WHEN** der Post-Merge-Schritt läuft
- **THEN** wird kein Ticket-Status verändert
- **AND** offene Tickets bleiben unangetastet

### Requirement: Post-Merge-Hook räumt offene Tickets auf

The system SHALL provide a post-merge hook or CI step that cleans up open tickets referenced
by merged commits, so the cleanup is automatic rather than manual.

#### Scenario: Post-Merge-Hook läuft automatisch

- **GIVEN** ein PR wurde gemergt
- **WHEN** der Post-Merge-Hook oder CI-Step ausgeführt wird
- **THEN** werden offene Tickets, die in den gemergten Commits referenziert sind, aufgeräumt
- **AND** der Vorgang ist automatisiert und erfordert keinen manuellen Eingriff

<!-- merged from change delta fix-ticket-tracking-T002279.md (e53bcd8ffacb) -->