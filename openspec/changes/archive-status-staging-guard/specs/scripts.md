## ADDED Requirements

### Requirement: archive stages the openspec status map unconditionally

The `archive` verb of `scripts/openspec.sh` SHALL regenerate and stage
`website/src/data/openspec-status.json` after moving the change to the archive, regardless of
the `TICKET_OFFLINE` environment variable. A failed regeneration or staging SHALL abort the
archive run (non-zero exit) instead of continuing silently.

#### Scenario: offline archive run still stages the status map

- **GIVEN** `TICKET_OFFLINE=1` and a change with ticket status `done`
- **WHEN** `scripts/openspec.sh archive <slug>` runs in a git worktree
- **THEN** the command SHALL exit 0
- **AND** `website/src/data/openspec-status.json` SHALL be part of the staged set
      (`git diff --cached --name-only`)

#### Scenario: failed status map regeneration aborts the archive run

- **GIVEN** the target directory for the status map does not exist (so the status map script
      cannot write its output)
- **WHEN** `scripts/openspec.sh archive <slug>` runs
- **THEN** the command SHALL exit non-zero
- **AND** no archive PR SHALL be created from a run whose status map is stale
