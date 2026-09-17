## ADDED Requirements

### Requirement: Half-archive detection does not spawn a process per archive entry

`scripts/openspec-half-archive-check.sh` SHALL derive the slug of each directory under
`openspec/changes/` and `openspec/changes/archive/` using shell built-ins only. The number
of external processes the script starts SHALL NOT grow with the number of archived
changes.

Rationale: the check runs from four call sites that all sit in hot paths — the pre-commit
hook (fail-closed), `scripts/agent-lock.sh reap` (advisory), `scripts/openspec.sh` and the
`test:openspec` gate. Deriving each slug with `basename` plus a `printf | sed` pipeline
starts two processes per directory. At 763 archived changes that is ~1526 process starts
and 3.3 s of the script's 4.0 s runtime, while the two `find` calls that enumerate the
directories cost 8 ms combined. The cost is therefore not in the traversal but in the
per-entry forks, and it grows with every change that gets archived.

Detection behaviour is unaffected by this requirement: a directory whose name does not
carry a `YYYY-MM-DD-` prefix is still skipped rather than treated as an archive entry.

#### Scenario: Process count stays constant as the archive grows

- **GIVEN** two synthetic `OPENSPEC_ROOT` trees whose archives hold a different number of
  dated entries
- **WHEN** `scripts/openspec-half-archive-check.sh` runs against each of them with a PATH
  shim counting invocations of `basename` and `sed`
- **THEN** both runs report the same number of counted invocations
- **AND** the counting shim is shown to register invocations at all, so an unchanged count
  cannot come from a shim that never fires

#### Scenario: An archive entry without a date prefix is still skipped

- **GIVEN** an archive directory whose name carries no `YYYY-MM-DD-` prefix and an open
  change directory of the same name
- **WHEN** `scripts/openspec-half-archive-check.sh` runs
- **THEN** it exits zero and does not report the name as half-archived

#### Scenario: A dated archive entry duplicating an open change is still reported

- **GIVEN** a slug that exists both under `openspec/changes/<slug>/` and under
  `openspec/changes/archive/<date>-<slug>/`
- **WHEN** `scripts/openspec-half-archive-check.sh` runs
- **THEN** it exits non-zero and names the slug in its output
