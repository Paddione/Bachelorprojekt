# batch-repo-hygiene-ops-fixes

## Purpose

_Purpose fehlt — beim nächsten inhaltlichen Delta zu batch-repo-hygiene-ops-fixes ergänzen._

## Requirements

### Requirement: branch-reaper unterstützt ticketlosen Sweep-Modus

The system SHALL branch-reaper.sh um einen ticketlosen Modus (`--all`/`--sweep`) erweitern, der über alle Remote-Heads läuft und je Branch REAP/KEEP mit Begründung ausgibt.

#### Scenario: Sweep über alle Remote-Branches

- **GIVEN** ein Bestand an Remote-Branches mit und ohne PR
- **WHEN** `scripts/branch-reaper.sh --sweep --dry-run` läuft
- **THEN** listet es jeden Branch mit REAP/KEEP und Begründung
- **AND** ohne `--ticket` bricht es nicht mehr mit Exit 2 ab

#### Scenario: Bestand ohne verwaiste Branches

- **GIVEN** keine verwaisten Remote-Branches
- **WHEN** der Sweep-Modus läuft
- **THEN** meldet er explizit "keine verwaisten Branches gefunden"
- **AND** unterscheidet sich von einem Fehlschlag (kein vakuoses Exit 0)

### Requirement: [gone]-Prune-Reihenfolge korrigieren

The system SHALL die Reihenfolge in repo-hygiene-ops.md §2 so korrigieren, dass der [gone]-Prune NACH branch-reaper läuft oder den Archiv-Tag als zulässiges Positiv-Signal akzeptiert.

#### Scenario: Reaper erzeugt [gone]-Refs im selben Lauf

- **GIVEN** branch-reaper löscht Remote-Branches
- **WHEN** der §2-[gone]-Pfad danach läuft
- **THEN** räumt er die neu entstandenen [gone]-Refs auf
- **AND** nutzt den Archiv-Tag (`refs/tags/reaped/<branch>`) als Sicherheitsanker

### Requirement: Konfliktprobe per merge-tree statt invasivem Merge

The system SHALL in repo-hygiene-ops.md §3 die `git merge-tree --write-tree`-Form als primäre Konflikt-Gegenprobe nennen und den Arbeitsbaum-Merge nur für den Fall vorsehen, in dem Konfliktmarker sichtbar sein sollen.

#### Scenario: Phantomkonflikt in dirty Worktree

- **GIVEN** ein PR-Worktree mit abweichender openspec-status.json (Normalfall)
- **WHEN** die Konfliktprobe gegen origin/main läuft
- **THEN** nutzt sie `git merge-tree --write-tree --name-only`
- **AND** fasst weder Working Tree noch Index an
- **AND** ein Exit 0 + Tree-SHA wird als konfliktfrei gewertet

### Requirement: gh pr checks cancelled ≠ fail

The system SHALL eine rot gemeldete GitHub-Check-Conclusion gegen `gh run view --json jobs` gegenprüfen, bevor sie als Fehler gewertet wird — `cancelled`/`skipped` ist kein `failure`.

#### Scenario: Aggregat-Job cancelled nach grünem Durchlauf

- **GIVEN** ein Check meldet "fail", aber alle Jobs sind success oder cancelled
- **WHEN** die Warteschleife den Check auswertet
- **THEN** stuft sie cancelled nicht als failure ein
- **AND** ein Re-Run genügt statt eines Codefehlers

### Requirement: statusCheckRollup auf head-SHA filtern

The system SHALL beim Auswerten von `statusCheckRollup` auf `.headSha == <headRefOid>` filtern und laufende/leere Conclusions explizit von negativen trennen.

#### Scenario: Läufe eines Vorgänger-Commits

- **GIVEN** Checks von einem Vorgänger-Commit (anderer headSha) erscheinen im Rollup
- **WHEN** die Watch-Schleife den PR-Zustand auswertet
- **THEN** ignoriert sie Checks fremder head-SHAs
- **AND** `conclusion=""` (laufend) wird nicht als Fehler gezählt

### Requirement: Factory-Tick-Vorcheck vor Worktree-Messung

The system SHALL in repo-hygiene-ops.md §1 den Vorcheck auf einen laufenden Factory-Tick (tick_running) dokumentieren und die Worktree-Messung unmittelbar vor dem Remove wiederholen.

#### Scenario: Factory-Tick verändert Worktrees unter dem Lauf

- **GIVEN** ein paralleler Factory-Tick läuft (tick_running=true)
- **WHEN** repo-hygiene die Worktree-Sektion ausführt
- **THEN** überspringt es die Worktree-Sektion oder wiederholt die --porcelain-Prüfung unmittelbar vor dem Remove
- **AND** die Entscheidung basiert auf dem zum Entscheidungszeitpunkt gültigen Zustand

#### Scenario: Cron läuft auch bei leerem non-main-Bestand durch (pipefail-Guard)

- **GIVEN** der Remote hat keine non-main-Branches (leerer grep-Bestand, `grep -v` Exit 1)
- **WHEN** `repo-hygiene-cron.sh standard` unter `set -euo pipefail` läuft
- **THEN** bricht es nicht an der `remote_branch_count`-Pipeline ab
- **AND** liefert Exit 0 mit gültiger JSON-Messung (leerer Bestand = Messwert, kein Fehlschlag)

<!-- merged from change delta batch-repo-hygiene-ops-fixes.md (ebf9e38f7e7c) -->

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

### Requirement: Runtime drift detection for unapplied database migrations

The system SHALL detect database functions whose installed definition lacks the evidence
marker declared by the migration that is supposed to have produced it.

Comparing full source text against `pg_proc.prosrc` is unreliable because `CREATE OR REPLACE`
normalizes the stored text. Each migration therefore declares its own evidence marker, and
the marker lives in the migration file so that writing a new migration makes it checkable
without touching a second file.

A migration declares its marker as a comment line of the form:

```sql
-- RUNTIME-CHECK: function=<schema>.<function> marker=<substring>
```

#### Scenario: Migration declared but not applied

- **GIVEN** a migration file under `scripts/one-shot/` declaring a `RUNTIME-CHECK` marker
- **AND** the installed function's `prosrc` does not contain that marker
- **WHEN** the drift check runs
- **THEN** it reports the function, the expected marker and the migration file that supplies
  it
- **AND** it exits with status 1

#### Scenario: Migration applied

- **GIVEN** a migration file declaring a `RUNTIME-CHECK` marker
- **AND** the installed function's `prosrc` contains that marker
- **WHEN** the drift check runs
- **THEN** it reports no drift for that function

#### Scenario: Database unreachable

- **GIVEN** the database cannot be reached
- **WHEN** the drift check runs
- **THEN** it reports the database checker as skipped, stating that it could not connect
- **AND** it does not report a drift for any function
- **AND** the skip alone does not cause a non-zero exit status

A guard that turns red without a cluster measures the environment rather than the state of
the system, so an unreachable database is reported as unknown, never as drift.

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

### Requirement: repo-hygiene reports runtime drift

The `repo-hygiene` skill SHALL run the drift check as part of its repository inspection and
surface its findings alongside the existing branch, worktree and queue findings.

#### Scenario: Hygiene run surfaces drift

- **GIVEN** a runtime drift is present
- **WHEN** the `repo-hygiene` skill inspects the repository
- **THEN** the drift appears in its findings with the remedy command

<!-- merged from change delta batch-repo-hygiene-ops-fixes.md (744968b821ea) -->

<!-- merged from change delta batch-repo-hygiene-ops-fixes.md (a4921c46c62c) -->