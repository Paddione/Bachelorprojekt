## ADDED Requirements

### Requirement: Archive staged die regenerierte Status-Map für den Folge-Commit

The system SHALL, after `scripts/openspec.sh archive <slug>` has moved the change directory
to the archive and regenerated `website/src/data/openspec-status.json`, stage the
regenerated file in the current git index (best-effort, never aborting the archive), so that
the caller's subsequent commit — which stages the `openspec/changes/` move — carries the
status map as well and the freshness gate does not report it as stale.

#### Scenario: Archiv-Commit trägt die regenerierte Status-Map

- **GIVEN** a change directory with a `.ticket` file is archived via
  `scripts/openspec.sh archive <slug>`
- **WHEN** the caller commits the archive (staging `openspec/changes/`)
- **THEN** the commit also contains the regenerated `website/src/data/openspec-status.json`
- **AND** `task freshness:check` passes on that commit without a manual regeneration step

#### Scenario: Archive bleibt erfolgreich, wenn das Staging fehlschlägt

- **GIVEN** `git add` fails while archiving a change (e.g. non-git index state)
- **WHEN** `scripts/openspec.sh archive <slug>` is invoked
- **THEN** the archive still succeeds (exit 0) and prints `archived: <slug> -> <dest>`
