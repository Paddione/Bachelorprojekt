## ADDED Requirements

### Requirement: agent-lock claim answers the help flag instead of locking it

`scripts/agent-lock.sh claim` SHALL recognise `-h` and `--help` as a request for its option
list and SHALL handle them **before** the first positional argument is taken as the scope
name. It SHALL print the option list, exit 0, and create no file in `$AGENT_LOCK_DIR`.

Taking `--help` as a scope produces a lock with an empty `id` under the file name
`--help__.json`. That lock counts as `live`, so `reap` never removes it and it keeps
polluting the `agent-lock.sh list` overview that `ticket-ops` and the `dev-flow-*` skills
build their pre-check on. The existing precedent is `scripts/worktree-create.sh`, which
handles `--help` ahead of all guards (T002783).

The assurance is on the semantics — a lock file comes into being or does not — not on the
wording of the help text (T002716).

#### Scenario: claim --help prints options and writes no lock

- **GIVEN** `AGENT_LOCK_DIR` points at an empty temporary directory
- **WHEN** `agent-lock.sh claim --help` runs
- **THEN** it exits 0, its output names at least one long option
- **AND** no `*.json` file exists in `AGENT_LOCK_DIR`, in particular no `--help__.json`

#### Scenario: a regular claim in the same directory still writes its lock

- **GIVEN** the same temporary `AGENT_LOCK_DIR`
- **WHEN** `agent-lock.sh claim ticket T0031070` runs
- **THEN** it exits 0 and `ticket__T0031070.json` exists in that directory

### Requirement: agent-lock claim rejects an empty or flag-shaped scope

`scripts/agent-lock.sh claim` SHALL reject an empty scope argument and a scope argument
beginning with `-` as an input error, exiting non-zero and creating no lock file. No lock
may come into being without a valid scope, including for future flags this change does not
anticipate.

#### Scenario: empty scope is refused

- **WHEN** `agent-lock.sh claim "" T0031072` runs
- **THEN** it exits non-zero and no new file appears in `AGENT_LOCK_DIR`

#### Scenario: unknown flag in scope position is refused

- **WHEN** `agent-lock.sh claim --bogus-flag` runs
- **THEN** it exits non-zero and no `--bogus-flag__.json` appears in `AGENT_LOCK_DIR`
