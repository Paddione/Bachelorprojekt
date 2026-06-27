## MODIFIED Requirements

### Requirement: Propose erstellt vollständiges Change-Skeleton

The system SHALL create a new change directory under `openspec/changes/<slug>/` with
`proposal.md`, `tasks.md`, a Delta-Spec unter `specs/<slug>/spec.md` (nested subdirectory),
und einer `.ticket`-Datei, und SHALL den zugeordneten Ticket-Status auf `planning` setzen.

#### Scenario: Erfolgreicher propose-Aufruf erstellt nested Spec-Struktur

- **GIVEN** kein Change mit dem Slug existiert in `openspec/changes/`
- **WHEN** `task openspec:propose -- <slug> --ticket <ext-id>` ausgeführt wird
- **THEN** wird `openspec/changes/<slug>/specs/<slug>/spec.md` angelegt (nested)
- **AND** die Datei enthält einen `## ADDED Requirements`-Header mit Requirement-Skeleton

#### Scenario: Doppelter Slug wird abgelehnt

- **GIVEN** `openspec/changes/my-feature/` existiert bereits
- **WHEN** `task openspec:propose -- my-feature --ticket T000999` ausgeführt wird
- **THEN** schlägt der Befehl mit einer Fehlermeldung fehl, ohne bestehende Dateien zu überschreiben

---

### Requirement: Validate akzeptiert alle vier Delta-Operations-Header

The system SHALL `ADDED`, `MODIFIED`, `REMOVED`, and `RENAMED` as valid delta operation headers
in both `scripts/openspec.sh::_validate_delta_file()` and `scripts/openspec-validate.ts::validateDeltaFile()`.

#### Scenario: RENAMED-Header wird akzeptiert

- **GIVEN** eine Delta-Spec mit `## RENAMED Requirements` Header
- **WHEN** `task openspec:validate` ausgeführt wird
- **THEN** wird die Datei als valide akzeptiert (kein FAIL für RENAMED)

#### Scenario: Szenario-Pflicht pro Requirement

- **GIVEN** eine Delta-Spec mit einer `### Requirement:` ohne `#### Scenario:` (4 Rauten)
- **WHEN** `task openspec:validate` ausgeführt wird
- **THEN** schlägt die Validation mit "missing Scenario" fehl

#### Scenario: Drei-Rauten-Scenario wird abgelehnt

- **GIVEN** eine Delta-Spec mit `### Scenario:` (3 Rauten statt 4)
- **WHEN** `task openspec:validate` ausgeführt wird
- **THEN** schlägt die Validation fehl (muss `#### Scenario:` sein)

---

### Requirement: Archive merged Delta section-aware in SSOT

The system SHALL merge only the Requirements content from a delta (stripping the
`## ADDED/MODIFIED/REMOVED/RENAMED Requirements` operation header) into the SSOT file,
and SHALL prepend a merge-comment (`<!-- merged from <slug> on <date> -->`) before the
merged block.

#### Scenario: ADDED Requirements werden ohne Operation-Header in SSOT gemergt

- **GIVEN** eine Delta-Spec mit `## ADDED Requirements` und zwei Requirements
- **WHEN** `task openspec:archive -- <slug>` ausgeführt wird (Ticket status done)
- **THEN** werden die Requirements in die SSOT angehängt
- **AND** der `## ADDED Requirements`-Header erscheint NICHT im SSOT
- **AND** ein `<!-- merged from <slug> on <date> -->` Kommentar steht vor dem Block

#### Scenario: RENAMED operation wird korrekt archiviert

- **GIVEN** eine Delta-Spec mit `## RENAMED Requirements` und einem FROM:/TO: Block
- **WHEN** `task openspec:archive -- <slug>` ausgeführt wird
- **THEN** wird ein RENAMED-Hinweis-Kommentar in den SSOT eingefügt

---

## ADDED Requirements

### Requirement: Upstream-CLI-Kompatibilität durch nested Spec-Struktur

The system SHALL store SSOT specs at `openspec/specs/<name>/spec.md` (nested subdirectory)
and delta specs at `openspec/changes/<slug>/specs/<cap>/spec.md` (nested subdirectory), so
that `openspec validate --all` from the upstream `@fission-ai/openspec@1.3.1` CLI can
discover and validate the full tree without returning zero items.

#### Scenario: Upstream validate erkennt alle Changes nach Migration

- **GIVEN** die Strukturmigration (flat → nested) ist durchgeführt
- **WHEN** `openspec validate --changes --json` ausgeführt wird
- **THEN** enthält das Ergebnis-JSON alle 26+ aktiven Changes (items > 0)
- **AND** kein Change hat ein "No deltas found" ERROR mehr

#### Scenario: Upstream validate erkennt alle SSOT Specs nach Migration

- **GIVEN** die Strukturmigration (flat → nested) ist durchgeführt
- **WHEN** `openspec validate --specs --json` ausgeführt wird
- **THEN** enthält das Ergebnis-JSON alle 63 SSOT-Spec-Entries (items > 0)
