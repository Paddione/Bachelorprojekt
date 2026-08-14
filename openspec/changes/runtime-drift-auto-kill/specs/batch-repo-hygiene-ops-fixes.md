# batch-repo-hygiene-ops-fixes — Delta-Spec (T004897)

## MODIFIED Requirements

### Requirement: Runtime drift detection for replaced MCP server binaries

The system SHALL detect MCP server processes that execute a binary which has since been
replaced on disk, and SHALL report each such process. By default the check reports without
terminating the process; with the explicit `--auto-kill` flag it additionally terminates the
drifting process.

A process holds its executable through an open inode handle. Replacing the file on disk
leaves the running process on the old code, which makes a merged fix ineffective while the
repository shows it as present. By default, terminating the process is an operator decision,
so the check reports and names the remedy instead of acting; `--auto-kill` automates exactly
that named remedy (`kill $pid; der Server startet beim naechsten Tool-Aufruf neu`).

The set of binaries to check SHALL be derived from the existing registry
`docs/agent-guide/registry/mcp.yaml` — every entry with `transport: stdio` — so that a newly
registered server is covered without maintaining a second list.

`--auto-kill` SHALL terminate only processes that match a registered stdio binary of the
registry — never a foreign process. The drift check SHALL accept unknown flags with a usage
error and exit status 2 instead of ignoring them.

#### Scenario: Process runs a deleted binary

- **GIVEN** an MCP server process whose `/proc/<pid>/exe` symlink resolves to a path ending
  in `" (deleted)"`
- **WHEN** the drift check runs
- **THEN** it reports that process with its PID, start time and the registry entry it
  belongs to
- **AND** it exits with status 1
- **AND** the process is still running afterwards

#### Scenario: Auto-kill terminates a registered drifting process

- **GIVEN** an MCP server process whose `/proc/<pid>/exe` symlink resolves to a path ending
  in `" (deleted)"` and whose binary is registered in the registry
- **WHEN** the drift check runs with `--auto-kill`
- **THEN** it reports the process with its PID and start time
- **AND** the process is terminated
- **AND** the drift check exits with status 0 once no residual drift remains

#### Scenario: Auto-kill leaves foreign processes untouched

- **GIVEN** a process outside the registry whose executable has been deleted
- **WHEN** the drift check runs with `--auto-kill`
- **THEN** the foreign process is still running afterwards

#### Scenario: Process binary differs from the file on disk

- **GIVEN** an MCP server process whose executable is readable and not marked deleted, but
  whose checksum differs from the file the registry points at
- **WHEN** the drift check runs
- **THEN** it reports both checksums for that process
- **AND** it exits with status 1

#### Scenario: All processes run the current binary

- **GIVEN** every registered stdio MCP server process executes the binary currently on disk
- **WHEN** the drift check runs
- **THEN** it reports no drift for the process checker
- **AND** it exits with status 0

### Requirement: Drift check never modifies system state

The drift check SHALL be read-only by default: it SHALL NOT terminate processes, apply
migrations, write to the database, or modify files. With the explicit `--auto-kill` flag,
terminating registered drifting processes is the documented exception; migrations are never
applied automatically, database findings remain operator decisions, and no files are
modified in either mode.

#### Scenario: Check runs against a drifted system

- **GIVEN** a system with both a replaced binary and an unapplied migration
- **WHEN** the drift check runs
- **THEN** the offending process is still running afterwards
- **AND** the installed function definition is unchanged
- **AND** the reported output names the command that would remedy each finding

#### Scenario: Auto-kill heals processes but never applies migrations

- **GIVEN** a system with a replaced binary and an unapplied migration
- **WHEN** the drift check runs with `--auto-kill`
- **THEN** the offending process is terminated
- **AND** the installed function definition is unchanged
- **AND** the unapplied migration is still reported as drift with exit status 1

