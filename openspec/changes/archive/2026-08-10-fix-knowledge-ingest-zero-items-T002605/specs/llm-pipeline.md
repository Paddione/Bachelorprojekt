## ADDED Requirements

### Requirement: Bug-Ticket-Ingest liest den lebenden Ticket-Store

The system SHALL read bug tickets for the knowledge collection "Bug Tickets"
from the live ticket store `tickets.tickets` filtered by
`brand = $1 AND type IN ('bug','fix')` — NOT from the empty legacy table
`bugs.bug_tickets`. The script SHALL resolve `fixed_in_pr` from
`tickets.ticket_links` (kind `fixes`) and SHALL NOT query columns that do not
exist on `tickets.tickets` (e.g. `ticket_id`).

#### Scenario: ConfigMap-Script selektiert aus tickets.tickets *(BATS)*

- **GIVEN** das gerenderte Kustomize-Manifest (`kubectl kustomize k3d`) enthält den Ingest-Script-Inhalt
- **WHEN** der Inhalt von `ingest-bug-tickets.mjs` auf die SELECT-Quelle geprüft wird
- **THEN** enthält der `FROM`-Teil `tickets.tickets` und NICHT `bugs.bug_tickets`

#### Scenario: Lokale Script-Kopie nutzt dieselbe Live-Quelle *(BATS)*

- **GIVEN** `scripts/knowledge/ingest-bug-tickets.mjs`
- **WHEN** der `FROM`-Teil der Query geprüft wird
- **THEN** referenziert er `tickets.tickets` und NICHT `bugs.bug_tickets`

### Requirement: PR-Ingest liest eine befüllte Live-Quelle

The system SHALL read PR history for the knowledge collection "PR History"
from a source that actually holds PR data in the live system: the join of
`tickets.ticket_links` (rows with `pr_number IS NOT NULL`) with
`tickets.tickets` for title and description — NOT from the never-populated
legacy table `bachelorprojekt.features`. If the diagnosis gate (Task 1)
confirms `tickets.pr_events` has no writer, the ticket_links-based query is
the implemented source.

#### Scenario: ConfigMap-Script selektiert aus ticket_links *(BATS)*

- **GIVEN** das gerenderte Kustomize-Manifest enthält den Ingest-Script-Inhalt
- **WHEN** der Inhalt von `ingest-prs.mjs` auf die SELECT-Quelle geprüft wird
- **THEN** enthält die Query `tickets.ticket_links` und NICHT `bachelorprojekt.features`

#### Scenario: Lokale Script-Kopie nutzt dieselbe Live-Quelle *(BATS)*

- **GIVEN** `scripts/knowledge/ingest-prs.mjs`
- **WHEN** der `FROM`-Teil der Query geprüft wird
- **THEN** referenziert er `tickets.ticket_links` und NICHT `bachelorprojekt.features`

### Requirement: Zero-Item-Guard gegen stille-grüne Fehler

The system SHALL detect the silent-green failure class: when a knowledge-ingest
query returns 0 rows while the corresponding live source table
(`tickets.tickets` for bugs, `tickets.ticket_links` for PRs) holds rows, the
script SHALL print a warning to stderr and exit with a non-zero status, so the
CronJob turns visibly red instead of reporting "Done." with 0 items. When both
the query result and the live source are genuinely empty, the script SHALL
exit 0 with a clear log line.

#### Scenario: 0 Treffer bei befülltem Live-Store → non-zero Exit

- **GIVEN** die Ingest-Query liefert 0 Zeilen
- **AND** `SELECT COUNT(*)` auf dem Live-Store (`tickets.tickets` bzw. `tickets.ticket_links`) ergibt > 0
- **WHEN** das Script läuft
- **THEN** loggt es eine Warnung (`0 items but live store has N rows — source misconfiguration?`) auf stderr und beendet mit Exit 1

#### Scenario: ehrlich leere Quelle → Exit 0 mit Hinweis

- **GIVEN** die Ingest-Query liefert 0 Zeilen
- **AND** der Live-Store hat ebenfalls 0 Zeilen
- **WHEN** das Script läuft
- **THEN** loggt es `0 items (live store empty — nothing to ingest)` und beendet mit Exit 0

### Requirement: Markdown-Ingest als bewusst lokal-only

The system SHALL NOT run a green no-op CronJob for markdown ingestion in the
cluster: `knowledge-ingest-markdown` SHALL be suspended
(`spec.suspend: true`), and the local-only path
(`task knowledge:reindex SOURCE=markdown`, requires repo mount) SHALL be
documented in the CronJob YAML comment and in the runbook documentation.

#### Scenario: Markdown-CronJob ist suspendiert *(BATS)*

- **GIVEN** `k3d/knowledge-ingest-cronjob.yaml`
- **WHEN** das Manifest auf `knowledge-ingest-markdown` geprüft wird
- **THEN** enthält dessen `spec.suspend: true` und einen Kommentar, der den lokalen Pfad dokumentiert

---

## MODIFIED Requirements

### Requirement: Knowledge-Ingest-Script-Schemakorrektur (keine nicht-existenten Spalten)

The schema-correction requirement is updated: `ingest-bug-tickets.mjs` SHALL
query `external_id`/`title`/`description` from `tickets.tickets` (not
`ticket_id` from `bugs.bug_tickets`), and `ingest-prs.mjs` SHALL query
`pr_number`/`title`/`description` from the ticket_links join (not
`merged_at` from `bachelorprojekt.features`).

#### Scenario: bestehende Schema-BATS-Tests bleiben grün

- **GIVEN** `tests/unit/knowledge-ingest-schema.bats` und `tests/unit/knowledge-ingest-bugs-schema.bats`
- **WHEN** die Tests gegen das gerenderte Manifest laufen
- **THEN** bleiben sie grün (keine nicht-existenten Spalten `body`, `labels`, `id`, `title` in den SELECTs der ConfigMap-Kopie)
