## ADDED Requirements

### Requirement: REQ-HEALTH-GOALS-AUDIT-001 — Audit-Runner als wiederholbarer Durchgang

`scripts/lib/zielfamilien-audit.sh` SHALL expose a `check` subcommand that evaluates every goal
measurement of a given family in `scripts/health-goals-check.sh` against a fixture corpus, and a
`list-families` subcommand that enumerates the audited families. `check` SHALL exit `0` when no
goal of the family violates an audit rule and exit `1` when at least one violation is found; per
goal it SHALL print one line `PASS <id>` or `FAIL <id> <rule>: <reason>` on stdout. The fixture
corpus SHALL be supplied via a `--fixture <dir>` option or the `ZF_AUDIT_FIXTURES` environment
variable, so the runner works without network, database or cluster access.

#### Scenario: A family with a violating goal exits non-zero

- **GIVEN** a fixture corpus where the `G-CQ02` measurement basis (directory `website/src`) is
  absent
- **WHEN** `scripts/lib/zielfamilien-audit.sh check --family CQ --fixture <corpus>` runs
- **THEN** it prints a `FAIL G-CQ02` line naming the existence-anchor rule
- **AND** exits `1`

#### Scenario: A clean family exits zero

- **GIVEN** a fixture corpus where every goal of family `DB` measures a real value against its
  basis
- **WHEN** `scripts/lib/zielfamilien-audit.sh check --family DB --fixture <corpus>` runs
- **THEN** it prints `PASS` lines only
- **AND** exits `0`

### Requirement: REQ-HEALTH-GOALS-AUDIT-002 — Fehlerklassen-Regeln

The audit runner SHALL implement at least the following rules, each mapped to the T002583/T002356
error class it detects:

- **E1 (M1 — vakuos grün):** a measurement that yields `0` or empty while its declared basis
  (file, field, endpoint, directory) is missing or empty SHALL be flagged.
- **E2 (SKIP-forever):** a measurement whose sole failure path is a catch-all fallback that
  returns the `-` skip sentinel SHALL be flagged unless a positive anchor distinguishes
  "basis missing" from "parse/format error".
- **E3 (toter Filter):** a measurement filtering on a key that does not exist in the fixture's
  real response SHALL be flagged.
- **E4 (Text im Vergleich):** a measurement that can emit a non-numeric value into
  `health-goals-check.sh`'s arithmetic comparison (`[ "$actual" -le "$target" ]`) SHALL be
  flagged.
- **E5 (Existenz-Anker):** a path/endpoint-based count (`grep`/`wc`/`find` over a directory or
  an HTTP call) without a preceding existence check SHALL be flagged — a vanished basis must not
  silently read as `0` = success.

#### Scenario: The M1 class is flagged before it reports green

- **GIVEN** a fixture where a goal's measurement counts `providers` in a response that only has a
  `degraded` list
- **WHEN** the runner evaluates that goal
- **THEN** it prints `FAIL <id> E1`
- **AND** never reports the goal as green

#### Scenario: A missing directory without anchor is flagged

- **GIVEN** a goal whose measurement greps `website/src` for `: any` and the directory does not
  exist in the fixture
- **WHEN** the runner evaluates that goal
- **THEN** it prints `FAIL <id> E5` (vanished basis → `0` would be vacuously green)

### Requirement: REQ-HEALTH-GOALS-AUDIT-003 — Committed Audit-Protokoll

`docs/health-goals/zielfamilien-audit.md` SHALL document the audit result per family in a table
(family, goals, verdict, error class, measure, status). Every family covered by the audit SHALL
have a row; families excluded (`G-LLM*` → T002442, `G-WT*` → T002443) SHALL be listed as excluded
with their ticket reference. The protocol SHALL be committed in the same PR as the goal changes it
documents, so the report survives OpenSpec archival and stays linkable from ticket T002584.

#### Scenario: Every audited family has a verdict row

- **GIVEN** the audit run over all in-scope families
- **WHEN** `docs/health-goals/zielfamilien-audit.md` is inspected
- **THEN** it contains one row per family with verdict `geprüft` and, for each found violation, the
  error class and the sharpening measure applied

### Requirement: REQ-HEALTH-GOALS-AUDIT-004 — Fixture-Suite als permanenter Guard

`tests/spec/health-goals/zielfamilien-audit.bats` SHALL run the audit runner against fixture
corpora in command-output verification mode (T002448-M4): an anchor test asserting the measurement
emits `n/a` (never `0`) when the basis is missing, and a violation test asserting the measurement
counts a prepared violation. The suite SHALL fail when a goal regresses into SKIP-forever or
vacuously-green behaviour. It SHALL run without network, database or cluster access.

#### Scenario: A regressed goal turns the suite red

- **GIVEN** a goal that after a later change measures `0` on a missing basis instead of `n/a`
- **WHEN** `tests/unit/lib/bats-core/bin/bats tests/spec/health-goals/zielfamilien-audit.bats`
  runs
- **THEN** the anchor test for that goal fails

### Requirement: REQ-HEALTH-GOALS-AUDIT-005 — Schärfung nur fehlerhafter Ziele

A goal flagged by the audit SHALL be sharpened following the T002442 pattern: a positive anchor as
the first statement of its measurement (anchor failure ⇒ `n/a`, never `0`), one measurement source
per family where practical, and `n/a` instead of `0` for a missing basis. Goals that pass the audit
SHALL NOT be rewritten; their fixture tests serve as regression protection only. The sharpening
SHALL NOT change the merge-gate semantics of `health-goals-check.sh` for unrelated goals.

#### Scenario: A passing goal is left untouched

- **GIVEN** a goal whose measurement produces a real number against its fixture and passes all
  audit rules
- **WHEN** the audit fix commit is inspected
- **THEN** the goal's section in `.claude/lib/goals.md` and its `row` line in
  `scripts/health-goals-check.sh` are byte-for-byte unchanged
